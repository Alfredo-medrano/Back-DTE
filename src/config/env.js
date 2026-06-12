/**
 * ========================================
 * CONFIGURACIÓN DE VARIABLES DE ENTORNO
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 */

require('dotenv').config();

const config = {
    // Entorno
    env: process.env.NODE_ENV || 'development',

    // Servidor
    port: process.env.PORT || 3000,

    // Docker Firmador
    docker: {
        url: process.env.DOCKER_FIRMADOR_URL || 'http://localhost:8113',
        timeout: 30000, // 30 segundos para firma
    },

    // Ministerio de Hacienda
    mh: {
        // SECURITY FIX (C5): No fallback — production requires explicit config via env-validator
        apiUrl: process.env.MH_API_URL || (process.env.NODE_ENV === 'production' ? undefined : 'https://apitest.dtes.mh.gob.sv'),
        authUrl: process.env.MH_AUTH_URL || (process.env.NODE_ENV === 'production' ? undefined : 'https://apitest.dtes.mh.gob.sv/seguridad/auth'),
        claveApi: process.env.CLAVE_API,
        clavePublica: process.env.CLAVE_PUBLICA,
        clavePrivada: process.env.CLAVE_PRIVADA,
        // NORMATIVA MH: Timeout máximo de 8 segundos para respuesta del API
        timeout: 8000,
        // NORMATIVA MH: Máximo 2 reintentos antes de contingencia
        maxReintentos: 2,
    },

    // Emisor
    emisor: {
        nit: process.env.NIT_EMISOR,
        nrc: process.env.NRC_EMISOR,
        nombre: process.env.NOMBRE_EMISOR,
        // SECURITY FIX (C5): No fallback to '00' in production
        ambiente: process.env.AMBIENTE || (process.env.NODE_ENV === 'production' ? undefined : '00'),
    },
};



module.exports = config;
