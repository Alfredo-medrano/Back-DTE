/**
 * ========================================
 * CLIENTE HTTP PARA HACIENDA
 * Arquitectura MVC Modular
 * ========================================
 * Configuración base del cliente HTTP para MH
 * Ubicación: shared/integrations/ (infraestructura)
 */

const axios = require('axios');
const config = require('../../config/env');
const logger = require('../logger');
const Redis = require('ioredis');

// Conexión a Redis condicional a la variable de entorno
const redisUrl = process.env.REDIS_URL;
let redis;

if (redisUrl) {
    redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
    });
} else {
    // Compartir el mapa transitorio en global para evitar discrepancias
    global.localTokenMap = global.localTokenMap || new Map();
    const localMap = global.localTokenMap;
    redis = {
        set: async (key, val, mode, ttlSeconds) => {
            localMap.set(key, { token: val, expiracion: Date.now() + (ttlSeconds * 1000) });
            return 'OK';
        },
        del: async (key) => {
            localMap.delete(key);
            return 1;
        }
    };
}

/**
 * Cliente HTTP configurado para API de Hacienda
 * NORMATIVA MH: Timeout máximo de 8 segundos
 */
const mhClient = axios.create({
    baseURL: config.mh.apiUrl,
    timeout: config.mh.timeout || 8000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Cliente para autenticación (usa form-urlencoded)
 */
const mhAuthClient = axios.create({
    baseURL: config.mh.authUrl,
    timeout: 15000, // Aumentado a 15s para entornos de prueba lentos
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

// Interceptor para reintento transparente tras 401 (Token vencido)
mhClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && originalRequest._credenciales) {
            originalRequest._retry = true;
            const creds = originalRequest._credenciales;
            const { nit, claveApi } = creds;
            
            try {
                logger.warn('Error 401 de Hacienda detectado. Auto-renovando token...', { nit });
                
                // 1. Limpiar caché
                const cacheKey = `dte:token:${nit}`;
                await redis.del(cacheKey);
                
                // 2. Solicitar nuevo token
                const params = new URLSearchParams();
                params.append('user', nit);
                params.append('pwd', claveApi);
                
                const authResponse = await mhAuthClient.post('', params);
                
                if (authResponse.data?.status === 'OK' && authResponse.data?.body?.token) {
                    const newToken = authResponse.data.body.token;
                    
                    // 3. Guardar en caché (23 horas)
                    await redis.set(cacheKey, newToken, 'EX', 82800);
                    
                    // 4. Actualizar header y reintentar
                    originalRequest.headers['Authorization'] = newToken;
                    logger.info('Token auto-renovado con éxito. Reintentando petición original.', { nit });
                    return mhClient(originalRequest);
                } else {
                    logger.error('Fallo al obtener nuevo token en auto-renovación', { response: authResponse.data });
                }
            } catch (authError) {
                logger.error('Error en proceso de auto-renovación de token', { error: authError.message });
            }
        }
        
        return Promise.reject(error);
    }
);

module.exports = {
    mhClient,
    mhAuthClient,
};
