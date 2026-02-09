/**
 * ========================================
 * RUTAS LEGACY (v1)
 * ========================================
 * Estas rutas se mantienen por compatibilidad.
 * Para nuevos clientes, usar /api/dte/v2/*
 * 
 * @deprecated Usar rutas v2 multi-tenant
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/status
 * Health check básico del servidor
 */
router.get('/status', (req, res) => {
    res.json({
        exito: true,
        sistema: 'Middleware Facturación Electrónica - El Salvador',
        version: '2.0.0',
        arquitectura: 'Multi-Tenant SaaS',
        timestamp: new Date().toISOString(),
        nota: 'Use /api/dte/v2/* para endpoints multi-tenant',
    });
});

/**
 * Middleware de deprecación para rutas legacy
 */
const deprecationWarning = (req, res) => {
    res.status(410).json({
        exito: false,
        codigo: 'DEPRECATED',
        error: 'Este endpoint está deprecado',
        migracion: {
            nuevo_endpoint: req.path.replace('/api/', '/api/dte/v2/'),
            documentacion: '/api/dte/v2/ejemplo',
            nota: 'Las rutas v1 requieren migración a v2 con API Key multi-tenant',
        },
    });
};

// Endpoints deprecados - devuelven 410 Gone
router.post('/facturar', deprecationWarning);
router.get('/factura/:codigoGeneracion', deprecationWarning);
router.post('/test-firma', deprecationWarning);
router.get('/ejemplo', deprecationWarning);
router.get('/test-auth', deprecationWarning);
router.post('/transmitir', deprecationWarning);

module.exports = router;
