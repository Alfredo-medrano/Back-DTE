/**
 * ========================================
 * MIDDLEWARE: AUDIT LOGGER
 * ========================================
 * Registra operaciones administrativas en la tabla audit_logs.
 *
 * ISO 27017 CLD.12.4.4 — Monitoreo de servicios cloud
 * ISO 27001 A.12 — Seguridad de las operaciones
 *
 * Uso:
 *   const { auditLog } = require('../../shared/middleware/audit-logger');
 *   // Después de una operación exitosa:
 *   await auditLog(req, { action: 'tenant.create', resource: 'Tenant', resourceId: tenant.id });
 */

const { prisma } = require('../db');
const logger = require('../logger');

/**
 * Registra una entrada de auditoría.
 * Diseñado como fire-and-forget para no bloquear la respuesta HTTP.
 *
 * @param {import('express').Request} req - Request de Express (para extraer IP, User-Agent, etc.)
 * @param {object} entry - Datos de la entrada de auditoría
 * @param {string} entry.action - Acción realizada (ej. 'tenant.create', 'apikey.revoke')
 * @param {string} entry.resource - Tipo de recurso (ej. 'Tenant', 'Emisor', 'ApiKey')
 * @param {string} [entry.resourceId] - ID del recurso afectado
 * @param {object} [entry.details] - Detalles adicionales (JSON)
 * @param {boolean} [entry.success=true] - Si la operación fue exitosa
 * @param {string} [entry.errorMsg] - Mensaje de error (si success=false)
 */
const auditLog = async (req, entry) => {
    try {
        // Determinar el actor
        let actorType = 'system';
        let actorId = 'system';

        if (req.tenantId) {
            // JWT frontend user
            actorType = 'jwt_user';
            actorId = req.tenantId;
        } else if (req.tenant?.id) {
            actorType = 'jwt_user';
            actorId = req.tenant.id;
        } else if (req.headers['x-admin-key']) {
            actorType = 'admin_key';
            actorId = 'admin';
        }

        await prisma.auditLog.create({
            data: {
                actorType,
                actorId,
                action: entry.action,
                resource: entry.resource,
                resourceId: entry.resourceId || null,
                ipAddress: req.ip || req.socket?.remoteAddress || null,
                userAgent: req.headers['user-agent']?.substring(0, 512) || null,
                requestId: req.requestId || null,
                details: entry.details || null,
                success: entry.success !== undefined ? entry.success : true,
                errorMsg: entry.errorMsg || null,
            },
        });

        logger.debug('Audit log created', {
            action: entry.action,
            resource: entry.resource,
            resourceId: entry.resourceId,
        });
    } catch (error) {
        // Fire-and-forget: no falla la respuesta HTTP si el audit log falla
        logger.error('Failed to write audit log', {
            action: entry.action,
            error: error.message,
        });
    }
};

/**
 * Middleware factory: registra audit log automáticamente en respuestas exitosas.
 * Se usa como middleware post-handler en rutas IAM.
 *
 * @param {string} action - Nombre de la acción (ej. 'tenant.create')
 * @param {string} resource - Tipo de recurso (ej. 'Tenant')
 */
const auditMiddleware = (action, resource) => {
    return (req, res, next) => {
        // Guardar el json original para interceptar la respuesta
        const originalJson = res.json.bind(res);

        res.json = (body) => {
            // Solo auditar si la respuesta fue exitosa (2xx)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                auditLog(req, {
                    action,
                    resource,
                    resourceId: body?.id || body?.tenant?.id || body?.emisor?.id || req.params?.tenantId,
                    details: { statusCode: res.statusCode },
                    success: true,
                }).catch(() => {}); // fire-and-forget
            }

            return originalJson(body);
        };

        next();
    };
};

module.exports = {
    auditLog,
    auditMiddleware,
};
