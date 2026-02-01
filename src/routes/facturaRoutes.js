/**
 * ========================================
 * RUTAS DE FACTURACIÓN
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 */

const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');

/**
 * GET /api/status
 * Verifica el estado del sistema (Docker + Hacienda)
 */
router.get('/status', facturaController.obtenerEstado);

/**
 * POST /api/facturar
 * Crea una nueva factura electrónica
 * Body: { emisor, receptor, items[], tipoDte?, correlativo? }
 */
router.post('/facturar', facturaController.crearFactura);

/**
 * GET /api/factura/:codigoGeneracion
 * Consulta el estado de una factura
 */
router.get('/factura/:codigoGeneracion', facturaController.consultarFactura);

/**
 * POST /api/test-firma
 * Prueba la firma de un documento (sin enviar a Hacienda)
 * Body: cualquier JSON
 */
router.post('/test-firma', facturaController.probarFirma);

/**
 * GET /api/ejemplo
 * Genera un documento DTE de ejemplo según Anexo II
 * (sin firmar ni enviar)
 */
router.get('/ejemplo', facturaController.generarEjemplo);

/**
 * GET /api/test-auth
 * Prueba la autenticación con Hacienda
 */
router.get('/test-auth', facturaController.probarAutenticacion);

/**
 * POST /api/transmitir
 * Transmite un documento DTE completo (JSON Anexo II ya armado)
 * Body: JSON completo con identificacion, emisor, receptor, cuerpoDocumento, resumen
 */
router.post('/transmitir', facturaController.transmitirDirecto);

module.exports = router;
