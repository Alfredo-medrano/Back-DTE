/**
 * ========================================
 * RUTAS DTE (v2 - Multi-Tenant)
 * Módulo: DTE
 * ========================================
 * Rutas protegidas con:
 * - tenantContext (autenticación)
 * - rateLimiter (límites por API Key)
 * - validateDTE (validación con Zod)
 */

const express = require('express');
const router = express.Router();
const { dteController, statusController } = require('./controllers');
const {
    tenantContext,
    requierePermisos,
    rateLimiter,
    validateDTE
} = require('../../shared/middleware');
const { checkPlanLimits } = require('../../modules/billing');

// ========================================
// RUTAS PÚBLICAS (sin autenticación)
// ========================================
router.get('/status', statusController.obtenerEstado);
router.get('/ejemplo', dteController.generarEjemplo);

// ========================================
// RUTAS PROTEGIDAS v2 (requieren API Key)
// ========================================

const v2Router = express.Router();

// Pipeline de middlewares: Auth → Rate Limit
v2Router.use(tenantContext);
v2Router.use(rateLimiter);

// Facturación con validación + límite de plan
v2Router.post('/facturar',
    requierePermisos('dte:create'),
    checkPlanLimits,  // 402 si el tenant superó su cuota mensual
    validateDTE,      // Valida schema según tipoDte
    dteController.crearFactura
);

// Anulación de DTE
v2Router.post('/factura/:codigoGeneracion/anular',
    requierePermisos('dte:create'),
    dteController.anularDTE
);

// Consultas
v2Router.get('/facturas', requierePermisos('dte:read'), dteController.listarFacturas);
v2Router.get('/factura/:codigoGeneracion', requierePermisos('dte:read'), dteController.consultarFactura);
v2Router.get('/estadisticas', requierePermisos('dte:read'), dteController.estadisticas);

// Pruebas (con credenciales del tenant)
v2Router.post('/test-firma', dteController.probarFirma);
v2Router.get('/test-auth', dteController.probarAutenticacion);

// Montar rutas v2
router.use('/v2', v2Router);

// ========================================
// RUTAS LEGACY (deprecadas)
// ========================================
// Se mantienen por compatibilidad pero no tienen
// las mejoras de validación ni rate limiting

module.exports = router;
