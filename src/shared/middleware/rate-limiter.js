/**
 * ========================================
 * MIDDLEWARE: RATE LIMITER
 * ========================================
 * SECURITY FIX (C4): Uses rate-limiter-flexible with Redis backend
 * when REDIS_URL is configured. Falls back to in-memory for development.
 *
 * In PM2 cluster mode with N workers, the Redis backend ensures the
 * rate limit is globally enforced (not N × rateLimit as before).
 *
 * Pattern: Replicates the conditional Redis/memory init from
 * mh-sender.service.js for consistency.
 */

const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const { TooManyRequestsError } = require('../errors');
const logger = require('../logger');

// ────────────────────────────────────────────────────────
// Conditional backend: Redis (production) or Memory (dev)
// ────────────────────────────────────────────────────────
let rateLimiterBackend;
let authRateLimiterBackend;

const initRateLimiters = () => {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        const Redis = require('ioredis');
        const redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            enableOfflineQueue: false,
        });

        redisClient.on('connect', () => logger.info('RateLimiter: Conectado a Redis'));
        redisClient.on('error', (err) => logger.error('RateLimiter: Redis error', { error: err.message }));

        // Per-API-Key limiter (tenant-scoped)
        rateLimiterBackend = new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl:tenant',
            points: 100,      // Default; overridden per-request from tenant.rateLimit
            duration: 60,      // 1 minute window
        });

        // Auth endpoint limiter (per-IP, stricter)
        authRateLimiterBackend = new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl:auth',
            points: 10,        // 10 attempts per minute
            duration: 60,
        });

        logger.info('RateLimiter: Usando Redis backend (distribuido, multi-worker safe)');
    } else {
        // Fallback for development — single-process only
        rateLimiterBackend = new RateLimiterMemory({
            keyPrefix: 'rl:tenant',
            points: 100,
            duration: 60,
        });

        authRateLimiterBackend = new RateLimiterMemory({
            keyPrefix: 'rl:auth',
            points: 10,
            duration: 60,
        });

        logger.warn('RateLimiter: Usando backend en memoria (solo dev/single-instance)');
    }
};

// Initialize on module load
initRateLimiters();

// ────────────────────────────────────────────────────────
// Rate limiter per API Key (tenant-scoped)
// ────────────────────────────────────────────────────────
const rateLimiter = async (req, res, next) => {
    try {
        // Without tenant context, skip (public routes have their own limiter)
        if (!req.tenant) {
            return next();
        }

        const cacheKey = req.tenant.id || req.headers.authorization?.substring(0, 20) || req.ip || 'unknown';
        const limite = req.tenant.rateLimit || 100;

        try {
            const rateLimiterRes = await rateLimiterBackend.consume(cacheKey, 1, { points: limite });

            // Informational headers
            res.set({
                'X-RateLimit-Limit': limite,
                'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
                'X-RateLimit-Reset': Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000),
            });

            next();
        } catch (rateLimiterRes) {
            // rate-limiter-flexible throws on limit exceeded
            if (rateLimiterRes instanceof Error) {
                // Actual error (Redis down, etc.) — fail open
                logger.error('RateLimiter error, allowing request', { error: rateLimiterRes.message });
                return next();
            }

            const segundosRestantes = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

            res.set({
                'X-RateLimit-Limit': limite,
                'X-RateLimit-Remaining': 0,
                'X-RateLimit-Reset': Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000),
                'Retry-After': segundosRestantes,
            });

            next(new TooManyRequestsError(
                `Límite de ${limite} peticiones/minuto excedido. Reintenta en ${segundosRestantes}s`,
                'RATE_LIMIT_EXCEEDED'
            ));
        }
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────────────────
// Configurable rate limiter (for auth endpoints, etc.)
// ────────────────────────────────────────────────────────
const rateLimiterCustom = (maxRequests = 100, windowMs = 60000) => {
    return async (req, res, next) => {
        const key = req.ip || 'unknown';

        try {
            await authRateLimiterBackend.consume(key, 1, {
                points: maxRequests,
                duration: Math.ceil(windowMs / 1000),
            });
            next();
        } catch (rateLimiterRes) {
            if (rateLimiterRes instanceof Error) {
                logger.error('AuthRateLimiter error, allowing request', { error: rateLimiterRes.message });
                return next();
            }

            return res.status(429).json({
                exito: false,
                error: {
                    mensaje: `Demasiadas peticiones. Límite: ${maxRequests}/${windowMs / 1000}s`,
                    codigo: 'RATE_LIMIT',
                },
            });
        }
    };
};

// ────────────────────────────────────────────────────────
// Rate limiter por IP para rutas públicas (sin tenant)
// SECURITY FIX (C3): El rateLimiter estándar hace next() si !req.tenant,
// dejando las rutas públicas sin limitación real. Este middleware limita
// directamente por IP y no depende del contexto de autenticación.
// ────────────────────────────────────────────────────────
const rateLimiterPublic = async (req, res, next) => {
    const key = `public:${req.ip || 'unknown'}`;
    const MAX_REQ = 30;  // 30 req/min por IP en rutas públicas
    const WINDOW_SEC = 60;

    try {
        const result = await authRateLimiterBackend.consume(key, 1, {
            points: MAX_REQ,
            duration: WINDOW_SEC,
        });

        res.set({
            'X-RateLimit-Limit': MAX_REQ,
            'X-RateLimit-Remaining': result.remainingPoints,
            'X-RateLimit-Reset': Math.ceil((Date.now() + result.msBeforeNext) / 1000),
        });

        next();
    } catch (rateLimiterRes) {
        if (rateLimiterRes instanceof Error) {
            logger.error('PublicRateLimiter error, allowing request', { error: rateLimiterRes.message });
            return next();
        }

        const segundosRestantes = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

        res.set({
            'X-RateLimit-Limit': MAX_REQ,
            'X-RateLimit-Remaining': 0,
            'Retry-After': segundosRestantes,
        });

        return res.status(429).json({
            exito: false,
            error: {
                mensaje: `Límite de consultas públicas excedido. Reintenta en ${segundosRestantes}s`,
                codigo: 'RATE_LIMIT_PUBLIC',
            },
        });
    }
};

module.exports = {
    rateLimiter,
    rateLimiterCustom,
    rateLimiterPublic,
};
