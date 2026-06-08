/**
 * ========================================
 * ÍNDICE DE CONTROLLERS DTE
 * Módulo: DTE
 * ========================================
 */

const dteController = require('./dte.controller');
const statusController = require('./status.controller');
const miCuentaController = require('./mi-cuenta.controller');
const contingenciaController = require('./contingencia.controller');

module.exports = {
    dteController,
    statusController,
    miCuentaController,
    contingenciaController,
};
