/**
 * ========================================
 * SERVICIO DE API KEYS
 * Módulo: IAM
 * ========================================
 * Gestión de API Keys para autenticación SaaS
 */

const { prisma } = require('../../../shared/db');
const crypto = require('crypto');

/**
 * Genera una nueva API Key
 * @param {string} tenantId - ID del tenant
 * @param {object} options - Opciones de la key
 * @returns {Promise<object>} API Key creada con la key en texto plano (solo una vez)
 */
const crear = async (tenantId, options = {}) => {
    const {
        nombre = 'Default',
        ambiente = '00',
        permisos = ['dte:create', 'dte:read'],
        rateLimit = 100,
    } = options;

    // Generar key única: sk_test_xxxx o sk_live_xxxx
    const prefix = ambiente === '01' ? 'sk_live_' : 'sk_test_';
    const randomPart = crypto.randomBytes(24).toString('hex');
    const key = `${prefix}${randomPart}`;

    const apiKey = await prisma.apiKey.create({
        data: {
            tenantId,
            key,
            nombre,
            ambiente,
            permisos,
            rateLimit,
        },
    });

    return {
        ...apiKey,
        keySecreta: key, // Solo se muestra una vez
    };
};

/**
 * Valida una API Key y retorna el tenant asociado
 * @param {string} key - API Key a validar
 * @returns {Promise<object|null>} Tenant asociado o null si no es válida
 */
const validar = async (key) => {
    if (!key || typeof key !== 'string') {
        return null;
    }

    const apiKey = await prisma.apiKey.findUnique({
        where: { key },
        include: {
            tenant: {
                include: {
                    emisores: {
                        where: { activo: true },
                    },
                },
            },
        },
    });

    if (!apiKey || !apiKey.activo || !apiKey.tenant.activo) {
        return null;
    }

    // Actualizar último uso
    await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { ultimoUso: new Date() },
    });

    return {
        apiKeyId: apiKey.id,
        ambiente: apiKey.ambiente,
        permisos: apiKey.permisos,
        rateLimit: apiKey.rateLimit,
        tenant: apiKey.tenant,
        emisores: apiKey.tenant.emisores,
    };
};

/**
 * Lista las API Keys de un tenant
 */
const listar = async (tenantId) => {
    const keys = await prisma.apiKey.findMany({
        where: { tenantId },
        select: {
            id: true,
            nombre: true,
            ambiente: true,
            permisos: true,
            rateLimit: true,
            activo: true,
            ultimoUso: true,
            createdAt: true,
            // NO incluir 'key' por seguridad
        },
        orderBy: { createdAt: 'desc' },
    });

    return keys;
};

/**
 * Revoca (desactiva) una API Key
 */
const revocar = async (apiKeyId) => {
    await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { activo: false },
    });
};

module.exports = {
    crear,
    validar,
    listar,
    revocar,
};
