/**
 * ========================================
 * MIDDLEWARE: RATE LIMITER
 * ========================================
 * Limita peticiones por API Key usando caché en memoria
 */

const { TooManyRequestsError } = require('../errors');

/**
 * Cache de rate limiting en memoria
 * Map<string, { count: number, resetTime: number }>
 */
const rateLimitCache = new Map();

/**
 * Limpieza periódica del caché (cada 5 minutos)
 */
setInterval(() => {
    const ahora = Date.now();
    for (const [key, value] of rateLimitCache.entries()) {
        if (value.resetTime < ahora) {
            rateLimitCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Rate limiter por API Key
 * Usa el límite configurado en la API Key del tenant
 */
const rateLimiter = (req, res, next) => {
    try {
        // Sin tenant context, usar límite genérico por IP
        if (!req.tenant) {
            return next();
        }

        const apiKeyId = req.headers.authorization?.substring(0, 20) || 'unknown';
        const limite = req.tenant.rateLimit || 100; // Requests por minuto
        const ventana = 60 * 1000; // 1 minuto

        const cacheKey = `rate:${apiKeyId}`;
        const ahora = Date.now();

        let registro = rateLimitCache.get(cacheKey);

        if (!registro || registro.resetTime < ahora) {
            // Nueva ventana
            registro = {
                count: 0,
                resetTime: ahora + ventana,
            };
        }

        registro.count++;
        rateLimitCache.set(cacheKey, registro);

        // Headers informativos
        res.set({
            'X-RateLimit-Limit': limite,
            'X-RateLimit-Remaining': Math.max(0, limite - registro.count),
            'X-RateLimit-Reset': Math.ceil(registro.resetTime / 1000),
        });

        if (registro.count > limite) {
            const segundosRestantes = Math.ceil((registro.resetTime - ahora) / 1000);
            throw new TooManyRequestsError(
                `Límite de ${limite} peticiones/minuto excedido. Reintenta en ${segundosRestantes}s`,
                'RATE_LIMIT_EXCEEDED'
            );
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Rate limiter configurable
 * @param {number} maxRequests - Máximo de peticiones
 * @param {number} windowMs - Ventana en milisegundos
 */
const rateLimiterCustom = (maxRequests = 100, windowMs = 60000) => {
    return (req, res, next) => {
        const key = req.ip || 'unknown';
        const cacheKey = `custom:${key}`;
        const ahora = Date.now();

        let registro = rateLimitCache.get(cacheKey);

        if (!registro || registro.resetTime < ahora) {
            registro = { count: 0, resetTime: ahora + windowMs };
        }

        registro.count++;
        rateLimitCache.set(cacheKey, registro);

        if (registro.count > maxRequests) {
            return res.status(429).json({
                exito: false,
                error: {
                    mensaje: `Demasiadas peticiones. Límite: ${maxRequests}/${windowMs / 1000}s`,
                    codigo: 'RATE_LIMIT',
                },
            });
        }

        next();
    };
};

module.exports = {
    rateLimiter,
    rateLimiterCustom,
};
