/**
 * ========================================
 * SERVICIO MINISTERIO DE HACIENDA
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Comunicación con la API del Ministerio de Hacienda
 * - Autenticación (obtener token)
 * - Envío de DTEs
 * - Consulta de estado
 */

const axios = require('axios');
const config = require('../../config/env');

// Almacenamiento temporal del token
let tokenCache = {
    token: null,
    expiracion: null,
};

// Cliente HTTP para Hacienda
// NORMATIVA MH: Timeout máximo de 8 segundos para respuesta del API
const mhClient = axios.create({
    baseURL: config.mh.apiUrl,
    timeout: config.mh.timeout || 8000, // Normativa: máximo 8 segundos
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Autenticación con el Ministerio de Hacienda
 * El token dura 24 horas
 * @returns {Promise<object>} { token, expiracion, error? }
 */
const autenticar = async () => {
    try {
        // Verificar si ya tenemos un token válido
        if (tokenCache.token && tokenCache.expiracion > Date.now()) {
            console.log('🔑 Usando token en caché');
            return {
                exito: true,
                token: tokenCache.token,
                mensaje: 'Token en caché válido',
            };
        }

        console.log('🔐 Solicitando nuevo token a Hacienda...');
        console.log(`   URL: ${config.mh.authUrl}`);
        console.log(`   NIT: ${config.emisor.nit}`);

        // Crear payload en formato x-www-form-urlencoded
        // Según documentación: se usa NIT y clave API
        const params = new URLSearchParams();
        params.append('user', config.emisor.nit);
        params.append('pwd', config.mh.claveApi);

        const response = await axios.post(config.mh.authUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        console.log('📩 Respuesta de Hacienda:', JSON.stringify(response.data, null, 2));

        if (response.data && response.data.status === 'OK' && response.data.body && response.data.body.token) {
            // Token obtenido, guardarlo en caché (23 horas de validez para seguridad)
            tokenCache = {
                token: response.data.body.token,
                expiracion: Date.now() + (23 * 60 * 60 * 1000), // 23 horas
            };

            console.log('✅ Token obtenido exitosamente');

            return {
                exito: true,
                token: tokenCache.token,
                mensaje: 'Autenticación exitosa',
            };
        }

        return {
            exito: false,
            token: null,
            error: response.data,
            mensaje: 'Respuesta inesperada de Hacienda',
        };

    } catch (error) {
        console.error('❌ Error de autenticación:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }

        return {
            exito: false,
            token: null,
            error: error.response?.data || error.message,
            mensaje: 'Error al autenticar con Hacienda',
        };
    }
};

/**
 * Envía un DTE firmado a Hacienda
 * @param {string} documentoFirmado - JWS del documento firmado
 * @param {string} ambiente - '00' = Pruebas, '01' = Producción
 * @param {string} tipoDte - Tipo de documento (01=Factura, 03=CCF, etc.)
 * @param {number} version - Versión del documento (1, 2, 3...)
 * @param {string} codigoGeneracion - UUID del documento (requerido por MH)
 * @returns {Promise<object>} Respuesta de Hacienda con sello
 */
const enviarDTE = async (documentoFirmado, ambiente = '00', tipoDte = '01', version = 1, codigoGeneracion = null) => {
    try {
        // Obtener token primero
        const auth = await autenticar();
        if (!auth.exito) {
            return {
                exito: false,
                error: auth.error,
                mensaje: 'No se pudo obtener token de autenticación',
            };
        }

        console.log('📤 Enviando DTE a Hacienda...');
        console.log(`   Ambiente: ${ambiente}`);
        console.log(`   Tipo DTE: ${tipoDte}`);
        console.log(`   Versión: ${version}`);
        console.log(`   Código Generación: ${codigoGeneracion}`);

        // Estructura del envío a Hacienda según normativa
        // NOTA: El codigoGeneracion puede estar dentro del documento JWS
        // El payload principal solo necesita estos campos
        const payload = {
            ambiente: ambiente,
            idEnvio: Number(Date.now()),      // ¡CRÍTICO! Debe ser entero, no string
            version: parseInt(version),
            tipoDte: tipoDte,
            codigoGeneracion: codigoGeneracion,  // ¡CRÍTICO! UUID del documento
            documento: documentoFirmado,
        };

        console.log('   Payload (sin documento):', JSON.stringify({ ...payload, documento: '[FIRMA JWS]' }, null, 2));

        const response = await mhClient.post('/fesv/recepciondte', payload, {
            headers: {
                'Authorization': auth.token, // El token ya incluye "Bearer "
                'Content-Type': 'application/json',
            },
        });

        if (response.data && response.data.estado === 'PROCESADO') {
            console.log('✅ DTE procesado por Hacienda');

            return {
                exito: true,
                estado: response.data.estado,
                selloRecibido: response.data.selloRecibido,
                codigoGeneracion: response.data.codigoGeneracion,
                numeroControl: response.data.numeroControl,
                fechaProcesamiento: response.data.fhProcesamiento,
                mensaje: 'DTE procesado exitosamente',
                respuestaCompleta: response.data,
            };
        }

        // Si hubo errores de validación
        return {
            exito: false,
            estado: response.data.estado,
            observaciones: response.data.observaciones,
            error: response.data,
            mensaje: 'DTE rechazado por Hacienda',
        };


    } catch (error) {
        console.error('❌ Error al enviar DTE:', error.message);

        // Mostrar detalles completos del error del MH
        if (error.response?.data) {
            console.error('📋 Detalles del error MH:', JSON.stringify(error.response.data, null, 2));
        }

        return {
            exito: false,
            error: error.response?.data || error.message,
            errorCompleto: error.response?.data,
            mensaje: 'Error de comunicación con Hacienda',
        };
    }
};

/**
 * Consulta el estado de un DTE enviado
 * @param {string} codigoGeneracion - UUID del documento
 * @param {string} tipoContingente - Tipo de contingencia (si aplica)
 * @returns {Promise<object>} Estado del DTE
 */
const consultarEstado = async (codigoGeneracion, tipoContingente = null) => {
    try {
        const auth = await autenticar();
        if (!auth.exito) {
            return { exito: false, error: 'Sin token' };
        }

        const params = {
            codigoGeneracion: codigoGeneracion,
        };

        if (tipoContingente) {
            params.tpContingente = tipoContingente;
        }

        const response = await mhClient.post('/fesv/consultadte', params, {
            headers: {
                'Authorization': auth.token,
            },
        });

        return {
            exito: true,
            data: response.data,
        };

    } catch (error) {
        return {
            exito: false,
            error: error.response?.data || error.message,
        };
    }
};

/**
 * Invalida (anula) un DTE
 * @param {string} documentoAnulacion - JWS del documento de anulación firmado
 * @returns {Promise<object>} Respuesta de Hacienda
 */
const anularDTE = async (documentoAnulacion) => {
    try {
        const auth = await autenticar();
        if (!auth.exito) {
            return { exito: false, error: 'Sin token' };
        }

        const payload = {
            ambiente: config.emisor.ambiente,
            idEnvio: Date.now(),
            version: 2,
            documento: documentoAnulacion,
        };

        const response = await mhClient.post('/fesv/anulardte', payload, {
            headers: {
                'Authorization': auth.token,
            },
        });

        return {
            exito: response.data.estado === 'PROCESADO',
            data: response.data,
        };

    } catch (error) {
        return {
            exito: false,
            error: error.response?.data || error.message,
        };
    }
};

/**
 * Limpia el token en caché (forzar re-autenticación)
 */
const limpiarToken = () => {
    tokenCache = { token: null, expiracion: null };
    console.log('🧹 Token limpiado');
};

module.exports = {
    autenticar,
    enviarDTE,
    consultarEstado,
    anularDTE,
    limpiarToken,
};
