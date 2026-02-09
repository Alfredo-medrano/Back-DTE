/**
 * ========================================
 * ERROR: TOO MANY REQUESTS (429)
 * ========================================
 */

const { AppError } = require('./app.error');

/**
 * Error de rate limiting (429)
 * Extiende AppError para que el error handler lo maneje correctamente
 */
class TooManyRequestsError extends AppError {
    constructor(mensaje = 'Demasiadas peticiones', codigo = 'RATE_LIMIT') {
        super(mensaje, 429, codigo);
        this.name = 'TooManyRequestsError';
    }
}

module.exports = { TooManyRequestsError };
