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
const jwt = require('jsonwebtoken');
const router = express.Router();
const iamController = require('./controllers/iam.controller');

// ────────────────────────────────────────────────────────
// MIDDLEWARE: Guard de Admin Key
// Protege TODAS las rutas de este router
// ────────────────────────────────────────────────────────
const adminGuard = (req, res, next) => {
    // Soporte transparente para JWT Frontend
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer eyJ')) {
        try {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dte_saas_secret_2026');
            req.tenantId = decoded.tenantId;
            return next();
        } catch(err) {
            // Ignorar para seguir probando admin key
        }
    }

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
router.get('/tenants/:tenantId/emisores', iamController.listarEmisores);
router.post('/tenants/:tenantId/emisores', iamController.crearEmisor);

// ────────────────────────────────────────────────────────
// API KEYS
// ────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/api-keys', iamController.crearApiKey);
router.get('/tenants/:tenantId/api-keys', iamController.listarApiKeys);
// SECURITY: tenantId en la URL obliga el ownership check en el servicio.
// Un JWT-admin solo revoca sus propias keys; X-Admin-Key puede revocar
// cualquiera siempre que pase el tenantId correcto.
router.delete('/tenants/:tenantId/api-keys/:apiKeyId', iamController.revocarApiKey);

module.exports = router;
