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
const repositories = require('./repositories');
const dtos = require('./dtos');
const builders = require('./builders');

module.exports = {
    dteRoutes,
    controllers,
    services,
    constants,
    repositories,
    dtos,
    builders,
};
