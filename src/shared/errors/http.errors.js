/**
 * ========================================
 * ERRORES HTTP
 * Arquitectura MVC Modular
 * ========================================
 * Errores HTTP comunes pre-definidos
 */

const { AppError } = require('./app.error');

/**
 * Error 400 - Bad Request
 */
class BadRequestError extends AppError {
    constructor(message = 'Solicitud inválida', code = 'BAD_REQUEST') {
        super(message, 400, code);
    }
}

/**
 * Error 401 - Unauthorized
 */
class UnauthorizedError extends AppError {
    constructor(message = 'No autorizado', code = 'UNAUTHORIZED') {
        super(message, 401, code);
    }
}

/**
 * Error 403 - Forbidden
 */
class ForbiddenError extends AppError {
    constructor(message = 'Acceso prohibido', code = 'FORBIDDEN') {
        super(message, 403, code);
    }
}

/**
 * Error 404 - Not Found
 */
class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado', code = 'NOT_FOUND') {
        super(message, 404, code);
    }
}

/**
 * Error 409 - Conflict
 */
class ConflictError extends AppError {
    constructor(message = 'Conflicto con el estado actual', code = 'CONFLICT') {
        super(message, 409, code);
    }
}

/**
 * Error 422 - Unprocessable Entity (Validación)
 */
class ValidationError extends AppError {
    constructor(message = 'Error de validación', errors = []) {
        super(message, 422, 'VALIDATION_ERROR');
        this.errors = errors; // Array de errores de validación
    }
}

/**
 * Error 503 - Service Unavailable
 */
class ServiceUnavailableError extends AppError {
    constructor(message = 'Servicio no disponible', code = 'SERVICE_UNAVAILABLE') {
        super(message, 503, code);
    }
}

module.exports = {
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
    ServiceUnavailableError,
};
