/**
 * ========================================
 * SERVICIO DOCKER FIRMADOR
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Comunicación con el contenedor Docker que firma documentos
 * Puerto: 8113 (mapeado desde 8013 interno)
 */

const axios = require('axios');
const config = require('../config/env');

// Cliente HTTP configurado para Docker
const dockerClient = axios.create({
    baseURL: config.docker.url,
    timeout: config.docker.timeout,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Verifica si el contenedor Docker está activo
 * @returns {Promise<object>} Estado del contenedor
 */
const verificarEstado = async () => {
    try {
        // Intentar hacer una petición simple al firmador
        // El firmador SVFE puede no tener endpoint /status, pero si responde (aunque sea 404)
        // significa que está activo
        const response = await dockerClient.get('/', {
            validateStatus: (status) => status < 500, // Aceptar cualquier status < 500
        });

        return {
            online: true,
            mensaje: 'Docker Firmador activo y accesible',
            status: response.status,
            data: response.data,
        };
    } catch (error) {
        // Si es error de red (ECONNREFUSED, ETIMEDOUT), el firmador NO está activo
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return {
                online: false,
                mensaje: 'Docker Firmador no responde - contenedor probablemente detenido',
                error: error.message,
            };
        }

        // Si es otro tipo de error HTTP, el firmador SÍ está respondiendo
        // (aunque el endpoint específico no exista)
        if (error.response) {
            return {
                online: true,
                mensaje: 'Docker Firmador activo (endpoint verificación no disponible)',
                status: error.response.status,
            };
        }

        // Error desconocido
        return {
            online: false,
            mensaje: 'Error al verificar firmador',
            error: error.message,
        };
    }
};

/**
 * Firma un documento DTE con el contenedor Docker
 * @param {object} documento - Documento JSON a firmar
 * @param {string} nit - NIT del emisor (SIN RELLENO, usar formato original)
 * @param {string} password - Contraseña de la llave privada
 * @returns {Promise<object>} Documento firmado en formato JWS
 */
const firmarDocumento = async (documento, nit, password) => {
    try {
        console.log('📝 Enviando documento a firmar (DEBUG)...');
        console.log('   URL Docker:', config.docker.url + '/firmardocumento/');
        console.log(`   NIT: '${nit}'`);
        console.log(`   Password: '******'`);

        // Preparar payload para el firmador
        const payload = {
            nit: nit,              // ✅ Usar NIT original SIN RELLENO
            activo: true,
            passwordPri: password,
            dteJson: documento,
        };

        const response = await dockerClient.post('/firmardocumento/', payload);

        // El firmador devuelve el JWS en response.data.body
        if (response.data && response.data.body) {
            console.log('✅ Documento firmado exitosamente');
            return {
                exito: true,
                firma: response.data.body,
                mensaje: 'Documento firmado correctamente',
            };
        }

        return {
            exito: false,
            error: 'Respuesta del firmador sin body',
            data: response.data,
        };

    } catch (error) {
        console.error('❌ Error al firmar:', error.message);
        return {
            exito: false,
            error: error.response?.data || error.message,
            mensaje: 'Error al firmar documento',
        };
    }
};

/**
 * Firma un documento para anulación
 * @param {object} documentoAnulacion - JSON del documento de anulación
 * @param {string} nit - NIT del emisor
 * @param {string} passwordPri - Contraseña de la clave privada
 * @returns {Promise<object>} Resultado de la firma
 */
const firmarAnulacion = async (documentoAnulacion, nit, passwordPri) => {
    // Usa el mismo proceso de firma
    return await firmarDocumento(documentoAnulacion, nit, passwordPri);
};

module.exports = {
    verificarEstado,
    firmarDocumento,
    firmarAnulacion,
    dockerClient,
};
