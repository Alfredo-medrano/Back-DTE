/**
 * ========================================
 * SERVICIO DE FIRMA
 * Módulo: DTE
 * ========================================
 * Comunicación con el contenedor Docker firmador
 * VERSIÓN MULTI-TENANT: Recibe credenciales como parámetros
 */

const { dockerClient } = require('../../../shared/integrations');
const { ejecutarConCircuito } = require('../../../shared/utils/circuit-breaker');
const logger = require('../../../shared/logger');

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
 * @param {object} params - Parámetros de firma
 * @param {object} params.documento - Documento JSON a firmar
 * @param {string} params.nit - NIT del emisor (formato Docker: 14 dígitos)
 * @param {string} params.clavePrivada - Contraseña de la llave privada
 * @returns {Promise<object>} Documento firmado en formato JWS
 */
const firmarDocumento = async ({ documento, nit, clavePrivada }) => {
    try {
        // Formatear NIT para Docker (14 dígitos)
        const nitDocker = nit.padStart(14, '0');

        logger.info('Enviando documento a firmar', { nit });

        const payload = {
            nit: nitDocker,
            activo: true,
            passwordPri: clavePrivada,
            dteJson: documento,
        };

        const response = await ejecutarConCircuito('DOCKER_FIRMADOR', () =>
            dockerClient.post('/firmardocumento/', payload)
        );

        if (response.data && response.data.body) {
            logger.info('Documento firmado exitosamente', { nit });
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
        logger.error('Error al firmar', { nit, error: error.message });
        return {
            exito: false,
            error: error.response?.data || error.message,
            mensaje: 'Error al firmar documento',
        };
    }
};

/**
 * Firma un documento para anulación
 * @param {object} params - Parámetros de firma
 */
const firmarAnulacion = async ({ documento, nit, clavePrivada }) => {
    return await firmarDocumento({ documento, nit, clavePrivada });
};

module.exports = {
    verificarEstado,
    firmarDocumento,
    firmarAnulacion,
};
