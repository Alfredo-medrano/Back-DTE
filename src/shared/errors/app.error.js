/**
 * ========================================
 * CLASE BASE DE ERRORES
 * Arquitectura MVC Modular
 * ========================================
 * Errores personalizados para el sistema
 */

/**
 * Error base de la aplicación
 * Todos los errores personalizados heredan de esta clase
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true; // Distingue errores esperados de bugs

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { AppError };
