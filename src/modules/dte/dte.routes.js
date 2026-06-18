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
const { dteController, statusController, miCuentaController, contingenciaController } = require('./controllers');
const {
    tenantContext,
    requierePermisos,
    rateLimiter,
    rateLimiterPublic,
    validateDTE
} = require('../../shared/middleware');
const { checkPlanLimits } = require('../../modules/billing');

// ========================================
// RUTAS PÚBLICAS (sin autenticación)
// ========================================
router.get('/status', statusController.obtenerEstado);
router.get('/ejemplo', dteController.generarEjemplo);
// SECURITY FIX (C3): Usar rateLimiterPublic (por IP, 30 req/min) en lugar de
// rateLimiter que dependía de req.tenant y hacía next() en rutas públicas.
router.get('/public/factura/:codigoGeneracion', rateLimiterPublic, dteController.consultarFacturaPublica);
router.get('/public/factura/:codigoGeneracion/pdf', rateLimiterPublic, dteController.descargarFacturaPDF);

// ========================================
// RUTAS PROTEGIDAS v2 (requieren API Key)
// ========================================

const v2Router = express.Router();

// Pipeline de middlewares: Auth → Rate Limit
v2Router.use(tenantContext);
v2Router.use(rateLimiter);

// Autogestión de cuenta y API Keys
v2Router.get('/mi-cuenta', miCuentaController.obtenerMiCuenta);
v2Router.get('/mi-cuenta/emisores', miCuentaController.obtenerMisEmisores);
v2Router.post('/mi-cuenta/emisores/:emisorId/certificado', miCuentaController.cargarCertificado);
v2Router.get('/mi-cuenta/api-keys', miCuentaController.listarMisApiKeys);
v2Router.post('/mi-cuenta/api-keys', miCuentaController.crearMiApiKey);
v2Router.delete('/mi-cuenta/api-keys/:apiKeyId', miCuentaController.revocarMiApiKey);
v2Router.get('/mi-cuenta/alertas-contingencia', miCuentaController.alertasContingencia);

// Control de Contingencia
v2Router.get('/mi-cuenta/contingencia', contingenciaController.obtenerEstado);
v2Router.post('/mi-cuenta/contingencia/activar', requierePermisos('dte:create'), contingenciaController.activarContingencia);
v2Router.post('/mi-cuenta/contingencia/desactivar', requierePermisos('dte:create'), contingenciaController.desactivarContingencia);
v2Router.post('/mi-cuenta/contingencia/limpiar', requierePermisos('dte:create'), contingenciaController.limpiarContingencia);
v2Router.post('/mi-cuenta/contingencia/regularizar', requierePermisos('dte:create'), contingenciaController.regularizarManual);

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

// Consultas y Conciliación
v2Router.get('/facturas', requierePermisos('dte:read'), dteController.listarFacturas);
v2Router.get('/factura/:codigoGeneracion', requierePermisos('dte:read'), dteController.consultarFactura);
v2Router.get('/factura/:codigoGeneracion/pdf', requierePermisos('dte:read'), dteController.descargarFacturaPDF);
v2Router.post('/factura/:codigoGeneracion/conciliar', requierePermisos('dte:create'), dteController.conciliarFactura);
v2Router.get('/estadisticas', requierePermisos('dte:read'), dteController.estadisticas);

// SECURITY FIX (C2): Rutas de prueba requerían autenticación básica (tenantContext)
// pero no verificaban permisos — cualquier API key podía firmar documentos o leer
// información sensible del tenant, incluyendo clientes con plan BASICO.
v2Router.post('/test-firma', requierePermisos('dte:create'), dteController.probarFirma);
v2Router.get('/test-auth', requierePermisos('dte:read'), dteController.probarAutenticacion);

// Montar rutas v2
router.use('/v2', v2Router);

// ========================================
// RUTAS LEGACY (deprecadas)
// ========================================
// Se mantienen por compatibilidad pero no tienen
// las mejoras de validación ni rate limiting

module.exports = router;
