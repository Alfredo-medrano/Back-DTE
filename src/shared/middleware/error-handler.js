/**
 * ========================================
 * MIDDLEWARE ERROR HANDLER
 * Arquitectura MVC Modular
 * ========================================
 * Manejo centralizado de errores
 */

const { AppError } = require('../errors');

/**
 * Middleware de manejo de errores global
 * Debe registrarse como último middleware
 */
const errorHandler = (error, req, res, next) => {
    // Si ya se envió respuesta, delegar al handler de Express
    if (res.headersSent) {
        return next(error);
    }

    // Log del error
    const timestamp = new Date().toISOString();
    console.error(`❌ [${timestamp}] Error:`, error.message);

    // Solo mostrar stack en desarrollo
    if (process.env.NODE_ENV === 'development') {
        console.error(error.stack);
    }

    // Si es un error operacional (esperado)
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            exito: false,
            codigo: error.code,
            error: error.message,
            ...(error.errors && { errores: error.errors }), // Para ValidationError
        });
    }

    // Errores de Axios (integraciones externas)
    if (error.isAxiosError) {
        const statusCode = error.response?.status || 503;
        return res.status(statusCode).json({
            exito: false,
            codigo: 'EXTERNAL_SERVICE_ERROR',
            error: 'Error de comunicación con servicio externo',
            detalle: error.response?.data || error.message,
        });
    }

    // Errores de validación de JSON
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            exito: false,
            codigo: 'INVALID_JSON',
            error: 'JSON inválido en el body de la petición',
        });
    }

    // Error no esperado (bug) - no revelar detalles en producción
    return res.status(500).json({
        exito: false,
        codigo: 'INTERNAL_ERROR',
        error: process.env.NODE_ENV === 'development'
            ? error.message
            : 'Error interno del servidor',
    });
};

/**
 * Middleware para rutas no encontradas
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        exito: false,
        codigo: 'NOT_FOUND',
        error: 'Ruta no encontrada',
        ruta: req.path,
        metodo: req.method,
    });
};

module.exports = {
    errorHandler,
    notFoundHandler,
};
