/**
 * ========================================
 * CLIENTE HTTP PARA FIRMADOR DOCKER
 * Arquitectura MVC Modular
 * ========================================
 * Configuración base del cliente HTTP para Docker
 * Ubicación: shared/integrations/ (infraestructura)
 */

const axios = require('axios');
const config = require('../../config/env');

/**
 * Cliente HTTP configurado para el contenedor Docker firmador
 * Puerto: 8113 (mapeado desde 8013 interno)
 */
const dockerClient = axios.create({
    baseURL: config.docker.url,
    timeout: config.docker.timeout || 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

module.exports = {
    dockerClient,
};
