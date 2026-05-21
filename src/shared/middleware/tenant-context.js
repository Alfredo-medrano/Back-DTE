/**
 * ========================================
 * MIDDLEWARE: TENANT CONTEXT
 * ========================================
 * Intercepta peticiones, valida API Key y carga contexto del tenant
 * Este es el "portero" del sistema multi-tenant
 */

const jwt = require('jsonwebtoken');
const { apiKeyService } = require('../../modules/iam/services');
const { UnauthorizedError, ForbiddenError } = require('../errors');
const logger = require('../logger');
const { prisma } = require('../db');

/**
 * Middleware para inyectar contexto del tenant en cada request
 * Extrae API Key del header Authorization: Bearer sk_xxx
 */
const tenantContext = async (req, res, next) => {
    try {
        // Extraer token de cookie o del header Authorization
        let apiKey = req.cookies?.dte_api_key;
        
        if (!apiKey) {
            const authHeader = req.headers.authorization;
            if (authHeader) {
                if (authHeader.startsWith('Bearer ')) {
                    apiKey = authHeader.substring(7);
                } else {
                    apiKey = authHeader;
                }
            }
        }

        if (!apiKey) {
            throw new UnauthorizedError('API Key o Cookie requerida', 'NO_API_KEY');
        }

        // Identificador si es JWT o API Key
        let contexto;

        // Si parece un token JWT (eyJ...)
        if (apiKey.startsWith('eyJ')) {
            try {
                const decoded = jwt.verify(apiKey, process.env.JWT_SECRET);
                
                // Buscar el emisor en prisma para reconstruir el "contexto" emulado
                const emisor = await prisma.emisor.findUnique({
                    where: { id: decoded.emisorId },
                    include: { tenant: true }
                });

                if (!emisor || emisor.tenantId !== decoded.tenantId) {
                    throw new Error('Token huérfano');
                }

                contexto = {
                    tenant: emisor.tenant,
                    emisores: [emisor],
                    ambiente: emisor.ambiente,
                    permisos: ['dte:create', 'dte:read', 'admin:read'], // Permisos por defecto para UI
                    rateLimit: 1000 // UI sin limitación estricta
                };
            } catch (err) {
                throw new UnauthorizedError('JWT Token inválido o expirado', 'INVALID_JWT');
            }
        } else {
            // Validar API Key normal
            contexto = await apiKeyService.validar(apiKey);
        }

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
        // El cliente puede especificar otro con header X-Emisor-Id o cookie dte_emisor_id
        const emisorIdParam = req.headers['x-emisor-id'] || req.cookies?.dte_emisor_id;
        if (emisorIdParam) {
            const emisorSeleccionado = contexto.emisores.find(e => e.id === emisorIdParam);
            if (!emisorSeleccionado) {
                throw new ForbiddenError('Emisor no encontrado o no pertenece al tenant', 'INVALID_EMISOR');
            }
            req.emisor = emisorSeleccionado;
        } else {
            req.emisor = contexto.emisores[0];
        }

        logger.info('Tenant autenticado', { tenant: req.tenant.nombre, emisor: req.emisor.nombre });

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
