/**
 * ========================================
 * ÍNDICE DEL MÓDULO IAM
 * ========================================
 * Identity & Access Management para SaaS
 */

const services = require('./services');

module.exports = {
    services,
    apiKeyService: services.apiKeyService,
    tenantService: services.tenantService,
};
