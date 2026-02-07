/**
 * ========================================
 * CLIENTE HTTP PARA HACIENDA
 * Arquitectura MVC Modular
 * ========================================
 * Configuración base del cliente HTTP para MH
 * Ubicación: shared/integrations/ (infraestructura)
 */

const axios = require('axios');
const config = require('../../config/env');

/**
 * Cliente HTTP configurado para API de Hacienda
 * NORMATIVA MH: Timeout máximo de 8 segundos
 */
const mhClient = axios.create({
    baseURL: config.mh.apiUrl,
    timeout: config.mh.timeout || 8000,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Cliente para autenticación (usa form-urlencoded)
 */
const mhAuthClient = axios.create({
    baseURL: config.mh.authUrl,
    timeout: config.mh.timeout || 8000,
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
});

module.exports = {
    mhClient,
    mhAuthClient,
};
