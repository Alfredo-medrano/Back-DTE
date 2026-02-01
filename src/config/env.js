/**
 * ========================================
 * CONFIGURACIÓN DE VARIABLES DE ENTORNO
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 */

require('dotenv').config();

const config = {
    // Servidor
    port: process.env.PORT || 3000,

    // Docker Firmador
    docker: {
        url: process.env.DOCKER_FIRMADOR_URL || 'http://localhost:8113',
        timeout: 30000, // 30 segundos
    },

    // Ministerio de Hacienda
    mh: {
        apiUrl: process.env.MH_API_URL || 'https://apitest.dtes.mh.gob.sv',
        authUrl: process.env.MH_AUTH_URL || 'https://apitest.dtes.mh.gob.sv/seguridad/auth',
        claveApi: process.env.CLAVE_API,
        clavePublica: process.env.CLAVE_PUBLICA,
        clavePrivada: process.env.CLAVE_PRIVADA,
    },

    // Emisor
    emisor: {
        nit: process.env.NIT_EMISOR,
        ambiente: process.env.AMBIENTE || '00', // 00 = Pruebas
    },
};

// Validación de configuración requerida
const validarConfig = () => {
    const requeridos = [
        { key: 'mh.claveApi', value: config.mh.claveApi },
        { key: 'mh.clavePublica', value: config.mh.clavePublica },
        { key: 'mh.clavePrivada', value: config.mh.clavePrivada },
    ];

    const faltantes = requeridos.filter(req => !req.value);

    if (faltantes.length > 0) {
        console.warn('⚠️  Variables de entorno faltantes:', faltantes.map(f => f.key).join(', '));
    }
};

validarConfig();

module.exports = config;
