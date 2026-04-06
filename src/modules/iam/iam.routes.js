/**
 * ========================================
 * RUTAS IAM ADMIN
 * Módulo: IAM
 * ========================================
 * Gestión de Tenants, Emisores y API Keys.
 * Protegidas por X-Admin-Key header.
 *
 * BASE: /admin
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const iamController = require('./controllers/iam.controller');

// ────────────────────────────────────────────────────────
// MIDDLEWARE: Guard de Admin Key
// Protege TODAS las rutas de este router
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
router.post('/tenants', iamController.crearTenant);
router.get('/tenants', iamController.listarTenants);
router.get('/tenants/:tenantId', iamController.obtenerTenant);

// ────────────────────────────────────────────────────────
// EMISORES
// ────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/emisores', iamController.crearEmisor);

// ────────────────────────────────────────────────────────
// API KEYS
// ────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/api-keys', iamController.crearApiKey);
router.get('/tenants/:tenantId/api-keys', iamController.listarApiKeys);
router.delete('/api-keys/:apiKeyId', iamController.revocarApiKey);

module.exports = router;
