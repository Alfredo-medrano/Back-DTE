/**
 * ========================================
 * ÍNDICE DE ERRORES
 * Arquitectura MVC Modular
 * ========================================
 * Exporta todos los errores personalizados
 */

const { AppError } = require('./app.error');
const {
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
    ServiceUnavailableError,
} = require('./http.errors');

module.exports = {
    // Base
    AppError,

    // HTTP Errors
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
    ServiceUnavailableError,
};
