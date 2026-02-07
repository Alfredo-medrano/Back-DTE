/**
 * ========================================
 * ÍNDICE SHARED
 * Arquitectura MVC Modular
 * ========================================
 * Punto de entrada único para todo lo compartido
 */

const errors = require('./errors');
const middleware = require('./middleware');
const utils = require('./utils');
const integrations = require('./integrations');
const db = require('./db');

module.exports = {
    errors,
    middleware,
    utils,
    integrations,
    db,
};
