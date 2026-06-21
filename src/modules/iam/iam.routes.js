/**
 * ========================================
 * RUTAS IAM ADMIN
 * Módulo: IAM
 * ========================================
 * Gestión de Tenants, Emisores y API Keys.
 * Protegidas por X-Admin-Key header.
 * ISO 27017 CLD.12.4.4 — Operaciones auditadas.
 *
 * BASE: /admin
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const iamController = require('./controllers/iam.controller');
const { auditMiddleware } = require('../../shared/middleware/audit-logger');

// ────────────────────────────────────────────────────────
// MIDDLEWARE: Guard de Admin Key
// Protege TODAS las rutas de este router
//
// SECURITY FIX (A1): Removed JWT bypass that allowed ANY
// authenticated user to access admin routes (privilege escalation).
// Admin routes now EXCLUSIVELY require X-Admin-Key.
// ────────────────────────────────────────────────────────
const adminGuard = (req, res, next) => {
    const adminKey = process.env.ADMIN_SECRET_KEY;
    const headerKey = req.headers['x-admin-key'];

    if (!adminKey) {
        // Si ADMIN_SECRET_KEY no está configurada, bloquear siempre
        return res.status(503).json({
            exito: false,
            mensaje: 'El panel de administración no está habilitado en este servidor.',
        });
    }

    if (!headerKey || headerKey.length !== adminKey.length ||
        !crypto.timingSafeEqual(Buffer.from(headerKey), Buffer.from(adminKey))) {
        return res.status(401).json({
            exito: false,
            mensaje: 'Acceso denegado. Proporciona X-Admin-Key válida.',
        });
    }

    next();
};

router.use(adminGuard);

// ────────────────────────────────────────────────────────
// TENANTS
// ────────────────────────────────────────────────────────
router.post('/tenants', auditMiddleware('tenant.create', 'Tenant'), iamController.crearTenant);
router.get('/tenants', iamController.listarTenants);
router.get('/tenants/:tenantId', iamController.obtenerTenant);

// ────────────────────────────────────────────────────────
// EMISORES
// ────────────────────────────────────────────────────────
router.get('/tenants/:tenantId/emisores', iamController.listarEmisores);
router.post('/tenants/:tenantId/emisores', auditMiddleware('emisor.create', 'Emisor'), iamController.crearEmisor);

// ────────────────────────────────────────────────────────
// API KEYS
// ────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/api-keys', auditMiddleware('apikey.create', 'ApiKey'), iamController.crearApiKey);
router.get('/tenants/:tenantId/api-keys', iamController.listarApiKeys);
// SECURITY: El tenantId en la URL obliga el control de propiedad en el servicio.
// Dado que las rutas de administración requieren obligatoriamente X-Admin-Key,
// esta operación se ejecuta exclusivamente bajo el contexto de administración global.
router.delete('/tenants/:tenantId/api-keys/:apiKeyId', auditMiddleware('apikey.revoke', 'ApiKey'), iamController.revocarApiKey);

module.exports = router;

