/**
 * ========================================
 * MIDDLEWARE: TENANT CONTEXT
 * ========================================
 * Intercepta peticiones, valida API Key y carga contexto del tenant
 * Este es el "portero" del sistema multi-tenant
 */

const { apiKeyService } = require('../../modules/iam/services');
const { UnauthorizedError, ForbiddenError } = require('../errors');

/**
 * Middleware para inyectar contexto del tenant en cada request
 * Extrae API Key del header Authorization: Bearer sk_xxx
 */
const tenantContext = async (req, res, next) => {
    try {
        // Extraer token del header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedError('API Key requerida', 'NO_API_KEY');
        }

        // Soportar "Bearer sk_xxx" o solo "sk_xxx"
        let apiKey;
        if (authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7);
        } else {
            apiKey = authHeader;
        }

        // Validar API Key
        const contexto = await apiKeyService.validar(apiKey);

        if (!contexto) {
            throw new UnauthorizedError('API Key inválida o desactivada', 'INVALID_API_KEY');
        }

        // Verificar que el tenant tenga al menos un emisor activo
        if (!contexto.emisores || contexto.emisores.length === 0) {
            throw new ForbiddenError('No hay emisores activos configurados', 'NO_EMISOR');
        }

        // Inyectar contexto en el request
        req.tenant = {
            id: contexto.tenant.id,
            nombre: contexto.tenant.nombre,
            plan: contexto.tenant.plan,
            ambiente: contexto.ambiente,
            permisos: contexto.permisos,
            rateLimit: contexto.rateLimit,
        };

        // Inyectar emisor por defecto (el primero activo)
        // El cliente puede especificar otro con header X-Emisor-Id
        const emisorIdHeader = req.headers['x-emisor-id'];
        if (emisorIdHeader) {
            const emisorSeleccionado = contexto.emisores.find(e => e.id === emisorIdHeader);
            if (!emisorSeleccionado) {
                throw new ForbiddenError('Emisor no encontrado o no pertenece al tenant', 'INVALID_EMISOR');
            }
            req.emisor = emisorSeleccionado;
        } else {
            req.emisor = contexto.emisores[0];
        }

        console.log(`🔐 Tenant: ${req.tenant.nombre} | Emisor: ${req.emisor.nombre}`);

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware opcional para verificar permisos específicos
 * @param {string[]} permisosRequeridos - Permisos necesarios
 */
const requierePermisos = (...permisosRequeridos) => {
    return (req, res, next) => {
        if (!req.tenant) {
            return next(new UnauthorizedError('Contexto de tenant no disponible'));
        }

        const tienePermiso = permisosRequeridos.every(permiso =>
            req.tenant.permisos.includes(permiso)
        );

        if (!tienePermiso) {
            return next(new ForbiddenError(
                `Permisos requeridos: ${permisosRequeridos.join(', ')}`,
                'INSUFFICIENT_PERMISSIONS'
            ));
        }

        next();
    };
};

module.exports = {
    tenantContext,
    requierePermisos,
};
