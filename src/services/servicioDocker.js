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
        const response = await dockerClient.get('/status');
        return {
            online: true,
            mensaje: 'Docker Firmador activo',
            data: response.data,
        };
    } catch (error) {
        // El firmador puede no tener endpoint /status, intentar otra forma
        try {
            // Intentar con un ping simple
            const response = await dockerClient.get('/');
            return {
                online: true,
                mensaje: 'Docker Firmador responde',
                data: response.data,
            };
        } catch (innerError) {
            return {
                online: false,
                mensaje: 'Docker Firmador no responde',
                error: error.message,
            };
        }
    }
};

/**
 * Firma un documento JSON con el certificado digital
 * @param {object} documento - JSON del documento a firmar (estructura DTE)
 * @param {string} nit - NIT del emisor
 * @param {string} passwordPri - Contraseña de la clave privada
 * @returns {Promise<object>} { firma: string (JWS), error?: string }
 */
const firmarDocumento = async (documento, nit, passwordPri) => {
    try {
        // Ajuste de NIT: El firmador SVFE suele requerir 14 dígitos.
        // Si es homologado (9 dígitos), probamos rellenando con ceros a la izquierda.
        let nitFormateado = String(nit).trim().replace(/-/g, ''); // Quitar guiones

        if (nitFormateado.length < 14) {
            console.log(`⚠️ NIT corto (${nitFormateado.length}), rellenando con ceros a la izquierda...`);
            nitFormateado = nitFormateado.padStart(14, '0');
        }

        // Estructura esperada por el Firmador SVFE
        const payload = {
            nit: nitFormateado,
            activo: true,
            passwordPri: passwordPri,
            dteJson: documento,
        };

        console.log('📝 Enviando documento a firmar (DEBUG)...');
        console.log(`   URL Docker: ${dockerClient.defaults.baseURL}/firmardocumento/`);
        console.log(`   NIT Original: '${nit}'`);
        console.log(`   NIT Enviado:  '${payload.nit}'`);
        console.log(`   Password: '${passwordPri ? '******' : 'MISSING'}'`);

        const response = await dockerClient.post('/firmardocumento/', payload);

        if (response.data && response.data.body) {
            console.log('✅ Documento firmado exitosamente');
            return {
                exito: true,
                firma: response.data.body, // El JWS firmado
                mensaje: 'Documento firmado correctamente',
            };
        }

        // Si no hay body, revisar la respuesta completa
        return {
            exito: true,
            firma: response.data,
            mensaje: 'Documento procesado',
        };

    } catch (error) {
        console.error('❌ Error al firmar documento:', error.message);

        return {
            exito: false,
            firma: null,
            error: error.response?.data || error.message,
            mensaje: 'Error al firmar el documento',
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
