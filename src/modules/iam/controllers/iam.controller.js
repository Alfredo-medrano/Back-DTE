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

// ------------------------------------------------
// TENANTS
// ------------------------------------------------

/**
 * Crear un nuevo tenant (cliente SaaS)
 * POST /admin/tenants
 */
const crearTenant = async (req, res, next) => {
    try {
        const { nombre, email, telefono, plan } = req.body;

        if (!nombre || !email) {
            throw new BadRequestError('nombre y email son requeridos', 'DATOS_INCOMPLETOS');
        }

        const tenant = await tenantService.crear({ nombre, email, telefono, plan });

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
        const { tenantId } = req.params;
        const tenant = await tenantService.obtenerPorId(tenantId);

        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

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
        const datosEmisor = req.body;

        const campos = ['nit', 'nrc', 'nombre', 'codActividad', 'descActividad', 'complemento', 'telefono', 'correo', 'mhClaveApi', 'mhClavePrivada'];
        const faltantes = campos.filter(c => !datosEmisor[c]);
        if (faltantes.length > 0) {
            throw new BadRequestError(`Campos requeridos faltantes: ${faltantes.join(', ')}`, 'DATOS_INCOMPLETOS');
        }

        // Verificar que el tenant existe
        const tenant = await tenantService.obtenerPorId(tenantId);
        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

        const emisor = await tenantService.crearEmisor(tenantId, datosEmisor);

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
        const { nombre, ambiente, permisos, rateLimit } = req.body;

        // Verificar que el tenant existe
        const tenant = await tenantService.obtenerPorId(tenantId);
        if (!tenant) throw new NotFoundError(`Tenant no encontrado: ${tenantId}`);

        const apiKey = await apiKeyService.crear(tenantId, { nombre, ambiente, permisos, rateLimit });

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
        const { tenantId } = req.params;
        const keys = await apiKeyService.listar(tenantId);
        res.json({ exito: true, datos: keys, total: keys.length });
    } catch (error) {
        next(error);
    }
};

/**
 * Revocar una API Key
 * DELETE /admin/api-keys/:apiKeyId
 */
const revocarApiKey = async (req, res, next) => {
    try {
        const { apiKeyId } = req.params;
        await apiKeyService.revocar(apiKeyId);
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
    crearApiKey,
    listarApiKeys,
    revocarApiKey,
};
