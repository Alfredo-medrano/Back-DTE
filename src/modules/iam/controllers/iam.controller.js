/**
 * ========================================
 * CONTROLADOR IAM ADMIN
 * Módulo: IAM
 * ========================================
 * Endpoints de administración para:
 * - Tenants (clientes SaaS)
 * - Emisores (empresas que facturan)
 * - API Keys (autenticación)
 *
 * NOTA: Estas rutas deben estar protegidas por
 * un admin-token a nivel de NGINX/API Gateway.
 * En esta implementación se protegen con
 * ADMIN_SECRET_KEY en el header X-Admin-Key.
 */

const { tenantService, apiKeyService } = require('../services');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const { crearTenantSchema, crearEmisorSchema, crearApiKeySchema } = require('../dtos/admin.schema');

// ------------------------------------------------
// TENANTS
// ------------------------------------------------

/**
 * Crear un nuevo tenant (cliente SaaS)
 * POST /admin/tenants
 */
const crearTenant = async (req, res, next) => {
    try {
        const parsed = crearTenantSchema.safeParse(req.body);
        if (!parsed.success) {
            const errores = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestError(`Validaci\u00f3n fallida: ${errores.join(', ')}`, 'VALIDATION_ERROR');
        }

        const tenant = await tenantService.crear(parsed.data);

        res.status(201).json({
            exito: true,
            mensaje: 'Tenant creado exitosamente',
            datos: tenant,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Listar todos los tenants activos
 * GET /admin/tenants
 */
const listarTenants = async (req, res, next) => {
    try {
        const tenants = await tenantService.listar();
        res.json({ exito: true, datos: tenants, total: tenants.length });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtener tenant por ID
 * GET /admin/tenants/:tenantId
 */
const obtenerTenant = async (req, res, next) => {
    try {
        let { tenantId } = req.params;
        if (tenantId === 'current') {
            tenantId = req.tenantId || req.tenant?.id || req.body?.tenantId;
        }
        
        const tenant = await tenantService.obtenerPorId(tenantId);

        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${req.params.tenantId}`);

        res.json({ exito: true, datos: tenant });
    } catch (error) {
        next(error);
    }
};

// ------------------------------------------------
// EMISORES
// ------------------------------------------------

/**
 * Crear un emisor para un tenant
 * POST /admin/tenants/:tenantId/emisores
 */
const crearEmisor = async (req, res, next) => {
    try {
        const { tenantId } = req.params;

        const parsed = crearEmisorSchema.safeParse(req.body);
        if (!parsed.success) {
            const errores = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestError(`Validaci\u00f3n fallida: ${errores.join(', ')}`, 'VALIDATION_ERROR');
        }

        // Verificar que el tenant existe
        const tenant = await tenantService.obtenerPorId(tenantId);
        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

        const emisor = await tenantService.crearEmisor(tenantId, parsed.data);

        // No devolver credenciales encriptadas en la respuesta
        const { mhClaveApi, mhClavePrivada, ...emisorSafe } = emisor;

        res.status(201).json({
            exito: true,
            mensaje: 'Emisor creado exitosamente. Credenciales MH almacenadas de forma segura.',
            datos: emisorSafe,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Listar emisores de un tenant
 * GET /admin/tenants/:tenantId/emisores
 */
const listarEmisores = async (req, res, next) => {
    try {
        let tenantId = req.params.tenantId;
        if (tenantId === 'current') {
            tenantId = req.tenantId || req.tenant?.id;
        }

        const tenant = await tenantService.obtenerPorId(tenantId);
        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

        res.json({ exito: true, datos: tenant.emisores || [], total: (tenant.emisores || []).length });
    } catch (error) {
        next(error);
    }
};

// ------------------------------------------------
// API KEYS
// ------------------------------------------------

/**
 * Crear una nueva API Key para un tenant
 * POST /admin/tenants/:tenantId/api-keys
 */
const crearApiKey = async (req, res, next) => {
    try {
        const { tenantId } = req.params;

        const parsed = crearApiKeySchema.safeParse(req.body);
        if (!parsed.success) {
            const errores = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestError(`Validaci\u00f3n fallida: ${errores.join(', ')}`, 'VALIDATION_ERROR');
        }

        // Verificar que el tenant existe
        const tenant = await tenantService.obtenerPorId(tenantId);
        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

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
 * Listar API Keys de un tenant (sin mostrar la key real)
 * GET /admin/tenants/:tenantId/api-keys
 */
const listarApiKeys = async (req, res, next) => {
    try {
        let tenantId = req.params.tenantId;
        if (tenantId === 'current' && req.tenantId) {
            tenantId = req.tenantId;
        }

        const keys = await apiKeyService.listar(tenantId);
        res.json({ exito: true, datos: keys, total: keys.length });
    } catch (error) {
        next(error);
    }
};

/**
 * Revocar una API Key
 * DELETE /admin/tenants/:tenantId/api-keys/:apiKeyId
 *
 * El tenantId se extrae de la URL para enforcement de ownership:
 * un admin con JWT solo puede revocar keys de su propio tenant,
 * y el admin global (X-Admin-Key) puede revocar cualquiera pasando
 * el tenantId en la URL.
 */
const revocarApiKey = async (req, res, next) => {
    try {
        const { apiKeyId, tenantId } = req.params;

        if (!tenantId) {
            throw new BadRequestError('Se requiere tenantId en la URL', 'MISSING_TENANT_ID');
        }

        await apiKeyService.revocar(apiKeyId, tenantId);
        res.json({ exito: true, mensaje: `API Key ${apiKeyId} revocada exitosamente` });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearTenant,
    listarTenants,
    obtenerTenant,
    crearEmisor,
    listarEmisores,
    crearApiKey,
    listarApiKeys,
    revocarApiKey,
};
