/**
 * ========================================
 * RUTAS DTE
 * Módulo: DTE
 * ========================================
 * Define todas las rutas del módulo de facturación
 */

const express = require('express');
const router = express.Router();
const { dteController, statusController } = require('./controllers');

// ========================================
// RUTAS DE ESTADO
// ========================================
router.get('/status', statusController.obtenerEstado);

// ========================================
// RUTAS DE FACTURACIÓN
// ========================================

// Crear factura (flujo completo)
router.post('/facturar', dteController.crearFactura);

// Transmitir documento DTE directo
router.post('/transmitir', dteController.transmitirDirecto);

// Consultar estado de factura
router.get('/factura/:codigoGeneracion', dteController.consultarFactura);

// Generar documento de ejemplo
router.get('/ejemplo', dteController.generarEjemplo);

// ========================================
// RUTAS DE PRUEBA
// ========================================
router.post('/test-firma', dteController.probarFirma);
router.get('/test-auth', dteController.probarAutenticacion);

module.exports = router;
