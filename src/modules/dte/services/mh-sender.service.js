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

/**
 * Cache de tokens por NIT (Multi-tenant)
 * Map<string, { token: string, expiracion: number }>
 */
const tokenCache = new Map();

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
        // Verificar token en caché para este NIT específico
        const cacheKey = nit;
        const cached = tokenCache.get(cacheKey);

        if (cached && cached.expiracion > Date.now()) {
            logger.debug('Usando token en caché', { nit });
            return { exito: true, token: cached.token, mensaje: 'Token en caché válido' };
        }

        logger.info('Solicitando nuevo token a Hacienda', { nit });

        const params = new URLSearchParams();
        params.append('user', nit);
        params.append('pwd', claveApi);

        const response = await mhAuthClient.post('', params);

        if (response.data?.status === 'OK' && response.data?.body?.token) {
            // Guardar en caché con clave única por NIT
            tokenCache.set(cacheKey, {
                token: response.data.body.token,
                expiracion: Date.now() + (23 * 60 * 60 * 1000), // 23 horas
            });
            logger.info('Token obtenido exitosamente', { nit });
            return { exito: true, token: response.data.body.token, mensaje: 'Autenticación exitosa' };
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
        logger.error('Error al enviar DTE', { nit: credenciales.nit, error: error.message });
        return { exito: false, error: error.response?.data || error.message, mensaje: 'Error de comunicación' };
    }
};

/**
 * Consulta el estado de un DTE enviado
 * @param {object} params - Parámetros de consulta
 */
const consultarEstado = async ({ codigoGeneracion, tipoContingente, credenciales }) => {
    try {
        const auth = await autenticar(credenciales);
        if (!auth.exito) return { exito: false, error: 'Sin token' };

        const params = { codigoGeneracion };
        if (tipoContingente) params.tpContingente = tipoContingente;

        const response = await mhClient.post('/fesv/consultadte', params, {
            headers: { 'Authorization': auth.token },
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
        });

        return { exito: response.data.estado === 'PROCESADO', data: response.data };
    } catch (error) {
        return { exito: false, error: error.response?.data || error.message };
    }
};

/**
 * Limpia el token en caché de un NIT específico
 */
const limpiarToken = (nit) => {
    if (nit) {
        tokenCache.delete(nit);
        logger.info('Token limpiado', { nit });
    } else {
        tokenCache.clear();
        logger.info('Todos los tokens limpiados');
    }
};

/**
 * Obtiene estadísticas del caché de tokens (debug)
 */
const estadisticasCache = () => {
    return {
        tokensActivos: tokenCache.size,
        nits: Array.from(tokenCache.keys()),
    };
};

module.exports = {
    autenticar,
    enviarDTE,
    consultarEstado,
    anularDTE,
    limpiarToken,
    estadisticasCache,
};
