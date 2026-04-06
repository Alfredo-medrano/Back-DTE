/**
 * ========================================
 * MIDDLEWARE REQUEST LOGGER
 * Arquitectura MVC Modular SaaS
 * ========================================
 * Logging estructurado de peticiones
 * INCLUYE: tenantId para filtrado de logs
 */

const logger = require('../logger');

/**
 * Logger de peticiones HTTP
 * Registra método, ruta, duración, status y tenantId
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();
    const requestId = generateRequestId();
    req.requestId = requestId;

    // Guardar método original de res.json para interceptar
    const originalJson = res.json.bind(res);

    res.json = (body) => {
        const duration = Date.now() - start;
        const statusIcon = res.statusCode < 400 ? '✅' : '❌';

        // Obtener tenantId del contexto (si está disponible)
        const tenantId = req.tenant?.id || 'anonymous';
        const tenantName = req.tenant?.nombre || '-';

        // Log estructurado para producción
        const logEntry = {
            timestamp: new Date().toISOString(),
            requestId,
            tenantId,
            tenantName,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
        };

        // Log estructurado con Winston
        logger.info('HTTP Request', logEntry);

        return originalJson(body);
    };

    // Continuar con la petición
    next();
};

/**
 * Logger detallado (solo desarrollo)
 */
const detailedLogger = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        logger.debug('Request details', {
            requestId: req.requestId,
            tenantId: req.tenant?.id,
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.body ? { ...req.body, mhClavePrivada: '[REDACTED]' } : undefined,
        });
    }
    next();
};

/**
 * Genera ID corto para tracking de request
 */
const generateRequestId = () => {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
};

/**
 * Logger de errores con contexto
 */
const errorLogger = (error, req, res, next) => {
    const tenantId = req.tenant?.id || 'anonymous';

    logger.error('Request error', {
        requestId: req.requestId,
        tenantId,
        method: req.method,
        path: req.path,
        errorName: error.name,
        errorMessage: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    next(error);
};

module.exports = {
    requestLogger,
    detailedLogger,
    errorLogger,
    generateRequestId,
};
