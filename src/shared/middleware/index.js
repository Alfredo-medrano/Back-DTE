/**
 * ========================================
 * ÍNDICE DE MIDDLEWARE
 * ========================================
 */

const { errorHandler } = require('./error-handler');
const { requestLogger } = require('./request-logger');
const { tenantContext, requierePermisos } = require('./tenant-context');
const { validateSchema, validateDTE } = require('./validate-dto');
const { rateLimiter, rateLimiterCustom } = require('./rate-limiter');

/**
 * Manejador de rutas no encontradas
 */
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        exito: false,
        error: {
            mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
            codigo: 'NOT_FOUND',
        },
    });
};

module.exports = {
    // Core
    errorHandler,
    requestLogger,
    notFoundHandler,

    // Auth
    tenantContext,
    requierePermisos,

    // Validation
    validateSchema,
    validateDTE,

    // Rate Limiting
    rateLimiter,
    rateLimiterCustom,
};
