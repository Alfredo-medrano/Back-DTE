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
const fs = require('fs');
const path = require('path');
const { prisma } = require('../../../shared/db');
const { decrypt } = require('../../../shared/services/encryption.service');

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
 * Firma un documento DTE con el contenedor Docker (CASO B — Escritura/Borrado temporal)
 * @param {object} params - Parámetros de firma
 * @param {object} params.documento - Documento JSON a firmar
 * @param {string} params.nit - NIT del emisor
 * @param {string} params.clavePrivada - Contraseña de la llave privada
 * @param {string} [params.emisorId] - ID del emisor (opcional, fallback a NIT)
 * @returns {Promise<object>} Documento firmado en formato JWS
 */
const firmarDocumento = async ({ documento, nit, clavePrivada, emisorId }) => {
    let privateKey = null;
    let certXml = null;
    let crtFilePath = null;
    let pubFilePath = null;
    let keyFilePath = null;

    try {
        const nitDocker = nit.padStart(14, '0');

        // 1. Obtener claves y certificado de la base de datos
        const emisor = emisorId
            ? await prisma.emisor.findUnique({
                where: { id: emisorId },
                select: { mhPrivateKey: true, mhCertificado: true }
              })
            : await prisma.emisor.findFirst({
                where: { nit },
                select: { mhPrivateKey: true, mhCertificado: true }
              });

        if (!emisor || !emisor.mhPrivateKey || !emisor.mhCertificado) {
            throw new Error('El emisor no tiene certificado o llave privada configurada en la base de datos.');
        }

        // 2. Descifrar llaves
        privateKey = decrypt(emisor.mhPrivateKey);
        certXml = decrypt(emisor.mhCertificado);

        // Convertir PEM a Buffer DER (el firmador Java espera binario DER para la llave privada)
        const keyDer = Buffer.from(privateKey.replace(/-----BEGIN[^-]+-----|-----END[^-]+-----|\s+/g, ''), 'base64');

        // Extraer llave pública del XML y convertir a DER
        const pubMatch = certXml.match(/<publicKey>[\s\S]*?<encodied>([\s\S]*?)<\/encodied>/);
        if (!pubMatch) {
            throw new Error('El certificado no contiene un tag <publicKey> con <encodied> válido.');
        }
        const pubDer = Buffer.from(pubMatch[1].replace(/\s+/g, ''), 'base64');

        // 3. Escribir temporalmente en el volumen compartido
        const certsDir = process.env.CERTS_DIR;
        if (!certsDir) {
            throw new Error('La variable de entorno CERTS_DIR no está configurada en el servidor.');
        }
        if (!fs.existsSync(certsDir)) {
            fs.mkdirSync(certsDir, { recursive: true });
        }

        crtFilePath = path.join(certsDir, `${nitDocker}.crt`);
        pubFilePath = path.join(certsDir, `${nitDocker}.pub`);
        keyFilePath = path.join(certsDir, `${nitDocker}.key`);

        fs.writeFileSync(crtFilePath, certXml, 'utf8');
        fs.writeFileSync(pubFilePath, pubDer);
        fs.writeFileSync(keyFilePath, keyDer);

        logger.info('Enviando documento a firmar', { nit: nitDocker });

        const payload = {
            nit: nitDocker,
            activo: true,
            passwordPri: clavePrivada,
            dteJson: documento,
        };

        const response = await ejecutarConCircuito('DOCKER_FIRMADOR', () =>
            dockerClient.post('/firmardocumento/', payload)
        );

        if (response.data && response.data.status === 'OK' && typeof response.data.body === 'string') {
            logger.info('Documento firmado exitosamente', { nit });
            return {
                exito: true,
                firma: response.data.body,
                mensaje: 'Documento firmado correctamente',
            };
        }

        const errorMsg = response.data?.body?.mensaje || response.data?.descripcion || response.data?.mensaje || 'Respuesta de firma inválida o con error';
        logger.error('Fallo en microservicio de firma Docker', { nit, error: errorMsg });

        return {
            exito: false,
            error: errorMsg,
            data: response.data,
        };

    } catch (error) {
        logger.error('Error al firmar', { nit, error: error.message });
        return {
            exito: false,
            error: error.response?.data?.body?.mensaje || error.response?.data?.descripcion || error.message,
            mensaje: 'Error al firmar documento',
        };
    } finally {
        // 4. Borrado obligatorio de disco (RAM) en try/finally
        try {
            if (crtFilePath && fs.existsSync(crtFilePath)) {
                fs.unlinkSync(crtFilePath);
            }
            if (pubFilePath && fs.existsSync(pubFilePath)) {
                fs.unlinkSync(pubFilePath);
            }
            if (keyFilePath && fs.existsSync(keyFilePath)) {
                fs.unlinkSync(keyFilePath);
            }
            logger.info(`Archivos de firma temporal para el NIT ${nit} eliminados exitosamente del directorio temporal.`);
        } catch (unlinkError) {
            logger.error('Error al eliminar archivos temporales de firma:', { error: unlinkError.message });
        }

        // 5. Asignar null a las variables de llaves en memoria
        privateKey = null;
        certXml = null;
        crtFilePath = null;
        pubFilePath = null;
        keyFilePath = null;
    }
};

/**
 * Firma un documento para anulación
 * @param {object} params - Parámetros de firma
 */
const firmarAnulacion = async ({ documento, nit, clavePrivada, emisorId }) => {
    return await firmarDocumento({ documento, nit, clavePrivada, emisorId });
};

module.exports = {
    verificarEstado,
    firmarDocumento,
    firmarAnulacion,
};
