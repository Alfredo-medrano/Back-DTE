/**
 * ========================================
 * ÍNDICE DE MIDDLEWARE
 * Arquitectura MVC Modular
 * ========================================
 */

const { errorHandler, notFoundHandler } = require('./error-handler');
const { requestLogger, detailedLogger } = require('./request-logger');

module.exports = {
    errorHandler,
    notFoundHandler,
    requestLogger,
    detailedLogger,
};
