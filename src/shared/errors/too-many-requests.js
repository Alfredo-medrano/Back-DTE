/**
 * ========================================
 * ERROR: TOO MANY REQUESTS (429)
 * ========================================
 */

class TooManyRequestsError extends Error {
    constructor(mensaje = 'Demasiadas peticiones', codigo = 'RATE_LIMIT') {
        super(mensaje);
        this.name = 'TooManyRequestsError';
        this.statusCode = 429;
        this.codigo = codigo;
    }
}

module.exports = { TooManyRequestsError };
