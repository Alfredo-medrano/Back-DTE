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

module.exports = {
    obtenerMiCuenta,
    obtenerMisEmisores,
    listarMisApiKeys,
    crearMiApiKey,
    revocarMiApiKey,
    alertasContingencia,
};
