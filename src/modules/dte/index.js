/**
 * ========================================
 * ÍNDICE DEL MÓDULO DTE
 * ========================================
 * Punto de entrada único para el módulo de facturación
 */

const dteRoutes = require('./dte.routes');
const controllers = require('./controllers');
const services = require('./services');
const constants = require('./constants');

module.exports = {
    dteRoutes,
    controllers,
    services,
    constants,
};
