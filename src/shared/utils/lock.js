/**
 * ========================================
 * UTILS: MUTEX LOCK (Concurrencia)
 * ========================================
 * Permite serializar peticiones utilizando Redis (en producción/cluster)
 * o un Set en memoria (en desarrollo/single instance).
 */

const Redis = require('ioredis');
const logger = require('../logger');

const redisUrl = process.env.REDIS_URL;
let redis = null;
const localLocks = new Set();

if (redisUrl) {
    redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
    });

    redis.on('error', (err) => {
        logger.error('Mutex Lock: Error de conexión a Redis para locks', { error: err.message });
    });
}

/**
 * Adquiere un lock exclusivo por clave con un TTL determinado.
 * @param {string} key - Clave única para el lock.
 * @param {number} ttlMs - Tiempo de vida del lock en milisegundos (default 5000ms).
 * @returns {Promise<boolean>} True si se adquirió con éxito, False si ya estaba bloqueado.
 */
const adquirirLock = async (key, ttlMs = 5000) => {
    const lockKey = `lock:${key}`;

    if (redis) {
        try {
            // NX: Set si no existe, PX: Expira en milisegundos
            const res = await redis.set(lockKey, '1', 'NX', 'PX', ttlMs);
            return res === 'OK';
        } catch (err) {
            logger.error('Mutex Lock: Falló adquisición en Redis, fallback a fail-open', { error: err.message });
            return true; // Fail-open para no interrumpir la facturación
        }
    } else {
        if (localLocks.has(key)) {
            return false;
        }
        localLocks.add(key);
        
        // Autoliberación por seguridad en caso de fallos
        setTimeout(() => {
            localLocks.delete(key);
        }, ttlMs);
        
        return true;
    }
};

/**
 * Libera el lock de forma inmediata.
 * @param {string} key - Clave única para el lock.
 */
const liberarLock = async (key) => {
    const lockKey = `lock:${key}`;

    if (redis) {
        try {
            await redis.del(lockKey);
        } catch (err) {
            logger.error('Mutex Lock: Error al eliminar lock de Redis', { error: err.message });
        }
    } else {
        localLocks.delete(key);
    }
};

module.exports = {
    adquirirLock,
    liberarLock,
};
