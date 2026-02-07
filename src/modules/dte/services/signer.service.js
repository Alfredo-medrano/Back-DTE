/**
 * ========================================
 * SERVICIO DE FIRMA
 * Módulo: DTE
 * ========================================
 * Comunicación con el contenedor Docker firmador
 */

const { dockerClient } = require('../../../shared/integrations');

/**
 * Verifica si el contenedor Docker está activo
 * @returns {Promise<object>} Estado del contenedor
 */
const verificarEstado = async () => {
    try {
        const response = await dockerClient.get('/', {
            validateStatus: (status) => status < 500,
        });

        return {
            online: true,
            mensaje: 'Docker Firmador activo y accesible',
            status: response.status,
        };
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return {
                online: false,
                mensaje: 'Docker Firmador no responde - contenedor probablemente detenido',
                error: error.message,
            };
        }

        if (error.response) {
            return {
                online: true,
                mensaje: 'Docker Firmador activo (endpoint verificación no disponible)',
                status: error.response.status,
            };
        }

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
 * @param {string} nit - NIT del emisor
 * @param {string} password - Contraseña de la llave privada
 * @returns {Promise<object>} Documento firmado en formato JWS
 */
const firmarDocumento = async (documento, nit, password) => {
    try {
        console.log('📝 Enviando documento a firmar...');
        console.log('   NIT:', nit);

        const payload = {
            nit: nit,
            activo: true,
            passwordPri: password,
            dteJson: documento,
        };

        const response = await dockerClient.post('/firmardocumento/', payload);

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
 */
const firmarAnulacion = async (documentoAnulacion, nit, passwordPri) => {
    return await firmarDocumento(documentoAnulacion, nit, passwordPri);
};

module.exports = {
    verificarEstado,
    firmarDocumento,
    firmarAnulacion,
};
