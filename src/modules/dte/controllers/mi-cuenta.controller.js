/**
 * ========================================
 * CONTROLADOR MI CUENTA (Self-service Tenant)
 * Módulo: DTE
 * ========================================
 * Endpoints autogestionados para el tenant autenticado:
 * - Consultar datos del propio Tenant
 * - Administrar sus propias API Keys
 *
 * Protegido por tenantContext (JWT o API Key propia).
 */

const { tenantService, apiKeyService } = require('../../iam/services');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const { crearApiKeySchema } = require('../../iam/dtos/admin.schema');
const { prisma } = require('../../../shared/db');
const multer = require('multer');
const { procesarCertificado } = require('../../../shared/utils/cert-helper');
const { encrypt } = require('../../../shared/services/encryption.service');
const logger = require('../../../shared/logger');

// Configuración de multer en memoria (para no guardar a disco temporalmente)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 } // 1MB max
}).single('certificado');

/**
 * Obtener información de la cuenta propia (Tenant)
 * GET /api/dte/v2/mi-cuenta
 */
const obtenerMiCuenta = async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tenant = await tenantService.obtenerPorId(tenantId);
        
        if (!tenant) {
            throw new NotFoundError('Cuenta no encontrada.');
        }

        res.json({ exito: true, datos: tenant });
    } catch (error) {
        next(error);
    }
};

/**
 * Listar API Keys del propio Tenant
 * GET /api/dte/v2/mi-cuenta/api-keys
 */
const listarMisApiKeys = async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const keys = await apiKeyService.listar(tenantId);
        res.json({ exito: true, datos: keys, total: keys.length });
    } catch (error) {
        next(error);
    }
};

/**
 * Crear una nueva API Key propia
 * POST /api/dte/v2/mi-cuenta/api-keys
 */
const crearMiApiKey = async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const parsed = crearApiKeySchema.safeParse(req.body);
        if (!parsed.success) {
            const errores = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestError(`Validación fallida: ${errores.join(', ')}`, 'VALIDATION_ERROR');
        }

        const apiKey = await apiKeyService.crear(tenantId, parsed.data);

        res.status(201).json({
            exito: true,
            mensaje: '⚠️ Guarda esta API Key de forma segura. No se mostrará de nuevo.',
            datos: {
                id: apiKey.id,
                nombre: apiKey.nombre,
                ambiente: apiKey.ambiente,
                permisos: apiKey.permisos,
                rateLimit: apiKey.rateLimit,
                apiKey: apiKey.keySecreta, // Solo visible en este momento
                createdAt: apiKey.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Revocar una API Key propia
 * DELETE /api/dte/v2/mi-cuenta/api-keys/:apiKeyId
 */
const revocarMiApiKey = async (req, res, next) => {
    try {
        const { apiKeyId } = req.params;
        const tenantId = req.tenant.id;

        await apiKeyService.revocar(apiKeyId, tenantId);
        res.json({ exito: true, mensaje: `API Key ${apiKeyId} revocada exitosamente` });
    } catch (error) {
        next(error);
    }
};

/**
 * Listar Emisores del propio Tenant
 * GET /api/dte/v2/mi-cuenta/emisores
 */
const obtenerMisEmisores = async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;
        const tenant = await tenantService.obtenerPorId(tenantId);
        
        if (!tenant) {
            throw new NotFoundError('Cuenta no encontrada.');
        }

        res.json({ exito: true, datos: tenant.emisores || [], total: (tenant.emisores || []).length });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtener alertas de contingencia para el tenant autenticado
 * GET /api/dte/v2/mi-cuenta/alertas-contingencia
 */
const alertasContingencia = async (req, res, next) => {
    try {
        const tenantId = req.tenant.id;

        // Buscar DTEs en contingencia
        const dtesContingencia = await prisma.dte.findMany({
            where: {
                tenantId,
                status: 'CONTINGENCIA',
            },
            orderBy: {
                fechaLimiteTransmision: 'asc',
            },
            select: {
                fechaLimiteTransmision: true,
            },
        });

        const contingenciaActiva = dtesContingencia.length > 0;
        const cantidadPendientes = dtesContingencia.length;
        const proximoVencer = contingenciaActiva ? dtesContingencia[0].fechaLimiteTransmision : null;

        res.json({
            exito: true,
            datos: {
                contingenciaActiva,
                cantidadPendientes,
                proximoVencer,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Cargar certificado para un emisor del tenant
 * POST /api/dte/v2/mi-cuenta/emisores/:emisorId/certificado
 */
const cargarCertificado = async (req, res, next) => {
    // Usar multer para procesar la subida
    upload(req, res, async (err) => {
        try {
            if (err) {
                throw new BadRequestError(`Error al subir archivo: ${err.message}`);
            }

            if (!req.file) {
                throw new BadRequestError('El archivo del certificado es requerido (campo "certificado").');
            }

            const { emisorId } = req.params;
            const tenantId = req.tenant.id;

            // 1. Validar que el emisorId pertenece al tenant autenticado
            const emisor = await prisma.emisor.findUnique({
                where: { id: emisorId }
            });

            if (!emisor || emisor.tenantId !== tenantId) {
                throw new NotFoundError('Emisor no encontrado o no pertenece a esta cuenta.');
            }

            // 2. Pasar el buffer a cert-helper.js para extraer y validar llaves
            let certData = null;
            try {
                certData = procesarCertificado(req.file.buffer);
            } catch (certError) {
                throw new BadRequestError(`Certificado inválido: ${certError.message}`);
            }

            const { nit: nitDetectado, publicKeyPem, privateKeyPem, certificadoXml } = certData;

            // Validar que el NIT del certificado coincida con el NIT del emisor
            const nitCertPadded = nitDetectado.padStart(14, '0');
            const nitEmisorPadded = emisor.nit.padStart(14, '0');
            if (nitCertPadded !== nitEmisorPadded) {
                throw new BadRequestError(`El NIT del certificado (${nitDetectado}) no coincide con el NIT del emisor (${emisor.nit}).`);
            }

            // 3. Cifrar llave pública, privada y el XML del certificado
            let encryptedPublicKey = encrypt(publicKeyPem);
            let encryptedPrivateKey = encrypt(privateKeyPem);
            let encryptedCertificado = encrypt(certificadoXml);

            // 4. Guardar en BD (campos mhPublicKey, mhPrivateKey, mhCertificado, certUploadedAt)
            const certUploadedAt = new Date();
            
            const updateData = {
                mhPublicKey: encryptedPublicKey,
                mhPrivateKey: encryptedPrivateKey,
                mhCertificado: encryptedCertificado,
                certUploadedAt
            };

            // Encriptar credenciales de Hacienda adicionales si fueron provistas
            let encClaveApi = null;
            let encClavePrivada = null;
            if (req.body.mhClaveApi) {
                encClaveApi = tenantService.encriptar(req.body.mhClaveApi);
                updateData.mhClaveApi = encClaveApi;
            }
            if (req.body.mhClavePrivada) {
                encClavePrivada = tenantService.encriptar(req.body.mhClavePrivada);
                updateData.mhClavePrivada = encClavePrivada;
            } else if (certData.clave) {
                encClavePrivada = tenantService.encriptar(certData.clave);
                updateData.mhClavePrivada = encClavePrivada;
            }

            await prisma.emisor.update({
                where: { id: emisorId },
                data: updateData
            });

            // 5. Limpiar variables sensibles asignando null antes de responder
            certData = null;
            encryptedPublicKey = null;
            encryptedPrivateKey = null;
            encryptedCertificado = null;
            encClaveApi = null;
            encClavePrivada = null;

            // En los logs solo registrar: "Certificado actualizado para emisorId X"
            logger.info(`Certificado actualizado para emisorId ${emisorId}`);

            // 6. Responder: { success: true, nitDetectado, fechaActualizacion }
            res.json({
                exito: true,
                success: true,
                nitDetectado,
                fechaActualizacion: certUploadedAt
            });

        } catch (error) {
            next(error);
        }
    });
};

module.exports = {
    obtenerMiCuenta,
    obtenerMisEmisores,
    listarMisApiKeys,
    crearMiApiKey,
    revocarMiApiKey,
    alertasContingencia,
    cargarCertificado,
};
