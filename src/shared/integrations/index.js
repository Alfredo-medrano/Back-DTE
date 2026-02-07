/**
 * ========================================
 * ÍNDICE DE INTEGRACIONES
 * Arquitectura MVC Modular
 * ========================================
 */

const { mhClient, mhAuthClient } = require('./mh-client');
const { dockerClient } = require('./docker-client');

module.exports = {
    mhClient,
    mhAuthClient,
    dockerClient,
};
