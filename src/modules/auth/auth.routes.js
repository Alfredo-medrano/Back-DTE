/**
 * ========================================
 * RUTAS DE AUTENTICACIÓN
 * Módulo: Auth
 * ========================================
 * SECURITY: Rate limited — 10 req/min por IP.
 * Previene brute-force contra credenciales MH.
 */

const express = require('express');
const { login, logout, me } = require('./auth.controller');
const { register } = require('./register.controller');
const { rateLimiterCustom } = require('../../shared/middleware/rate-limiter');
const router = express.Router();

// SECURITY: 10 intentos/minuto por IP para auth endpoints (ISO 27001 A.9)
const authRateLimiter = rateLimiterCustom(10, 60_000);

router.post('/login', authRateLimiter, login);
router.post('/register', authRateLimiter, register);
router.post('/logout', logout);
router.get('/me', me);

module.exports = router;
