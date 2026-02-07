/**
 * ========================================
 * MIDDLEWARE REQUEST LOGGER
 * Arquitectura MVC Modular
 * ========================================
 * Logging estructurado de peticiones
 */

/**
 * Logger de peticiones HTTP
 * Registra método, ruta, duración y status
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Guardar método original de res.json para interceptar
    const originalJson = res.json.bind(res);

    res.json = (body) => {
        const duration = Date.now() - start;
        const statusIcon = res.statusCode < 400 ? '✅' : '❌';

        console.log(
            `${statusIcon} ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
        );

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
        console.log('📥 Request:', {
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.body,
            headers: {
                'content-type': req.headers['content-type'],
                'authorization': req.headers['authorization'] ? '[PRESENTE]' : '[AUSENTE]',
            },
        });
    }
    next();
};

module.exports = {
    requestLogger,
    detailedLogger,
};
