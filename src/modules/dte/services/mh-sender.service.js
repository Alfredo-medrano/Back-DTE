/**
 * ========================================
 * SERVICIO MINISTERIO DE HACIENDA
 * Módulo: DTE
 * ========================================
 * Comunicación con API del MH para envío/consulta de DTEs
 * VERSIÓN MULTI-TENANT: Caché de tokens por NIT
 */

const { mhClient, mhAuthClient } = require('../../../shared/integrations');
const { ejecutarConCircuito } = require('../../../shared/utils/circuit-breaker');
const logger = require('../../../shared/logger');
const Redis = require('ioredis');

// Conexión a Redis condicional a la variable de entorno
const redisUrl = process.env.REDIS_URL;
let redis;

if (redisUrl) {
    redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
    });

    redis.on('connect', () => logger.info('Redis: Conectado a la caché global DTE'));
    redis.on('error', (err) => logger.error('Redis cache error', { error: err.message }));
} else {
    logger.warn('REDIS_URL no configurado. Usando caché en RAM compartida transitoria (No multi-instancia).');
    global.localTokenMap = global.localTokenMap || new Map();
    const localMap = global.localTokenMap;
    redis = {
        get: async (key) => {
            const hit = localMap.get(key);
            if (hit && hit.expiracion > Date.now()) {
                return hit.token;
            }
            if (hit) localMap.delete(key);
            return null;
        },
        set: async (key, val, mode, ttlSeconds) => {
            localMap.set(key, { token: val, expiracion: Date.now() + (ttlSeconds * 1000) });
            return 'OK';
        },
        del: async (...keys) => {
            keys.forEach(k => localMap.delete(k));
            return keys.length;
        },
        keys: async (pattern) => {
            const prefix = pattern.replace(/\*$/, '');
            return Array.from(localMap.keys()).filter(k => k.startsWith(prefix));
        }
    };
}

/**
 * Obtiene un token del caché o solicita uno nuevo
 * @param {object} credenciales - Credenciales del emisor
 * @param {string} credenciales.nit - NIT del emisor (usuario MH)
 * @param {string} credenciales.claveApi - Clave API de Hacienda
 * @returns {Promise<object>} Resultado de autenticación
 */
const autenticar = async (credenciales) => {
    const { nit, claveApi } = credenciales;

    if (!nit || !claveApi) {
        return { exito: false, token: null, mensaje: 'Credenciales incompletas (nit y claveApi requeridos)' };
    }

    try {
        // Verificar token en caché global (Redis) para este NIT específico
        const cacheKey = `dte:token:${nit}`;
        const cachedToken = await redis.get(cacheKey);

        if (cachedToken) {
            logger.debug('Usando token en caché global', { nit });
            return { exito: true, token: cachedToken, mensaje: 'Token en caché válido' };
        }

        logger.info('Solicitando nuevo token a Hacienda', { nit });

        const params = new URLSearchParams();
        params.append('user', nit);
        params.append('pwd', claveApi);

        // Solicitud de autenticación protegida por el Circuit Breaker
        const response = await ejecutarConCircuito('HACIENDA_MH', async () => {
            return await mhAuthClient.post('', params);
        });

        if (response.data?.status === 'OK' && response.data?.body?.token) {
            // Guardar en caché con clave única por NIT
            const newToken = response.data.body.token;
            // MH token expira a las 24 hrs. Lo guardamos 23 horas (82800 seg)
            await redis.set(cacheKey, newToken, 'EX', 82800);
            
            logger.info('Token obtenido exitosamente', { nit });
            return { exito: true, token: newToken, mensaje: 'Autenticación exitosa' };
        }

        return { exito: false, token: null, error: response.data, mensaje: 'Respuesta inesperada de Hacienda' };

    } catch (error) {
        logger.error('Error de autenticación MH', { nit, error: error.message });
        if (process.env.DEBUG_AUTH === 'true' && error.response) {
            logger.debug('DEBUG_AUTH response data', { data: error.response.data });
        }
        return { exito: false, token: null, error: error.response?.data || error.message, mensaje: 'Error al autenticar' };
    }
};

/**
 * Envía un DTE firmado a Hacienda
 * @param {object} params - Parámetros de envío
 * @param {string} params.documentoFirmado - Documento JWS firmado
 * @param {string} params.ambiente - Ambiente (00=pruebas, 01=producción)
 * @param {string} params.tipoDte - Tipo de DTE (01, 03, 05, etc.)
 * @param {number} params.version - Versión del esquema
 * @param {string} params.codigoGeneracion - UUID del documento
 * @param {object} params.credenciales - Credenciales del emisor
 */
const enviarDTE = async ({ documentoFirmado, ambiente, tipoDte, version, codigoGeneracion, credenciales }) => {
    try {
        const auth = await autenticar(credenciales);
        if (!auth.exito) {
            return { exito: false, error: auth.error, mensaje: 'No se pudo obtener token' };
        }

        logger.info('Enviando DTE a Hacienda', { nit: credenciales.nit, ambiente, tipoDte, version });

        const payload = {
            ambiente,
            idEnvio: Number(Date.now()),
            version: parseInt(version),
            tipoDte,
            codigoGeneracion,
            documento: documentoFirmado,
        };

        // Envío con Circuit Breaker (protección contra caídas de MH)
        const response = await ejecutarConCircuito('HACIENDA_MH', async () => {
            return await mhClient.post('/fesv/recepciondte', payload, {
                headers: { 'Authorization': auth.token },
                _credenciales: credenciales,
            });
        });

        if (response.data?.estado === 'PROCESADO') {
            logger.info('DTE procesado por Hacienda', { nit: credenciales.nit });
            return {
                exito: true,
                estado: response.data.estado,
                selloRecibido: response.data.selloRecibido,
                codigoGeneracion: response.data.codigoGeneracion,
                numeroControl: response.data.numeroControl,
                fechaProcesamiento: response.data.fhProcesamiento,
                mensaje: 'DTE procesado exitosamente',
            };
        }

        return {
            exito: false,
            estado: response.data.estado,
            observaciones: response.data.observaciones,
            error: response.data,
            mensaje: 'DTE rechazado por Hacienda',
        };

    } catch (error) {
        logger.error('Error al enviar DTE', { 
            nit: credenciales.nit, 
            error: error.message,
            mhResponse: error.response?.data
        });
        return { exito: false, error: error.response?.data || error.message, mensaje: 'Error de comunicación' };
    }
};

/**
 * Envía un Evento de Contingencia firmado a Hacienda
 * @param {object} params
 * @param {string} params.documentoFirmado - Evento JWS firmado
 * @param {string} params.ambiente - Ambiente (00=pruebas, 01=producción)
 * @param {number} params.version - Versión (3 por defecto)
 * @param {string} params.codigoGeneracion - UUID del evento
 * @param {object} params.credenciales - Credenciales del emisor
 */
const enviarEventoContingencia = async ({ documentoFirmado, ambiente, version, codigoGeneracion, credenciales }) => {
    try {
        const auth = await autenticar(credenciales);
        if (!auth.exito) {
            return { exito: false, error: auth.error, mensaje: 'No se pudo obtener token' };
        }

        logger.info('Enviando Evento de Contingencia a Hacienda', { nit: credenciales.nit, ambiente, version, codigoGeneracion });

        const payload = {
            ambiente,
            idEnvio: Number(Date.now()),
            version: parseInt(version || 3, 10),
            codigoGeneracion,
            documento: documentoFirmado,
        };

        // Envío con Circuit Breaker
        const response = await ejecutarConCircuito('HACIENDA_MH', async () => {
            return await mhClient.post('/fesv/contingencia', payload, {
                headers: { 'Authorization': auth.token },
                _credenciales: credenciales,
            });
        });

        if (response.data?.estado === 'PROCESADO' || response.data?.estado === 'RECIBIDO') {
            logger.info('Evento de contingencia procesado por Hacienda', { nit: credenciales.nit, estado: response.data.estado });
            return {
                exito: true,
                estado: response.data.estado,
                selloRecibido: response.data.selloRecibido,
                codigoGeneracion: response.data.codigoGeneracion,
                fechaProcesamiento: response.data.fhProcesamiento,
                mensaje: 'Evento de contingencia procesado exitosamente',
            };
        }

        return {
            exito: false,
            estado: response.data?.estado,
            observaciones: response.data?.observaciones || response.data?.descripcionMsg,
            error: response.data,
            mensaje: 'Evento de contingencia rechazado por Hacienda',
        };

    } catch (error) {
        logger.error('Error al enviar Evento de Contingencia', { 
            nit: credenciales.nit, 
            error: error.message,
            mhResponse: error.response?.data
        });
        return { exito: false, error: error.response?.data || error.message, mensaje: 'Error de comunicación' };
    }
};


const consultarEstado = async ({ codigoGeneracion, tdte, credenciales }) => {
    try {
        const auth = await autenticar(credenciales);
        if (!auth.exito) return { exito: false, error: 'Sin token' };

        const payload = {
            nitEmisor: credenciales.nit,
            tdte: tdte || '01',
            codigoGeneracion,
        };

        const response = await mhClient.post('/fesv/recepcion/consultadte/', payload, {
            headers: { 'Authorization': auth.token },
            _credenciales: credenciales,
        });

        return { exito: true, data: response.data };
    } catch (error) {
        return { exito: false, error: error.response?.data || error.message };
    }
};

/**
 * Invalida (anula) un DTE
 * @param {object} params - Parámetros de anulación
 */
const anularDTE = async ({ documentoAnulacion, ambiente, credenciales }) => {
    try {
        const auth = await autenticar(credenciales);
        if (!auth.exito) return { exito: false, error: 'Sin token' };

        const payload = {
            ambiente,
            idEnvio: Date.now(),
            version: 2,
            documento: documentoAnulacion,
        };

        const response = await mhClient.post('/fesv/anulardte', payload, {
            headers: { 'Authorization': auth.token },
            _credenciales: credenciales,
        });

        return { exito: response.data.estado === 'PROCESADO', data: response.data };
    } catch (error) {
        return { exito: false, error: error.response?.data || error.message };
    }
};

/**
 * Limpia el token en caché global de un NIT específico
 */
const limpiarToken = async (nit) => {
    if (nit) {
        await redis.del(`dte:token:${nit}`);
        logger.info('Token limpiado de Redis', { nit });
    } else {
        // En multi-tenant es peligroso vaciar todo redis, buscar keys dte:token:*
        const keys = await redis.keys('dte:token:*');
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        logger.info('Todos los tokens DTE limpiados');
    }
};

/**
 * Obtiene estadísticas del caché de tokens (debug)
 */
const estadisticasCache = async () => {
    const keys = await redis.keys('dte:token:*');
    return {
        tokensActivos: keys.length,
        nits: keys.map(k => k.split(':')[2])
    };
};

module.exports = {
    autenticar,
    enviarDTE,
    enviarEventoContingencia,
    consultarEstado,
    anularDTE,
    limpiarToken,
    estadisticasCache,
};
