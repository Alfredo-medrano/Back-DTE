/**
 * ========================================
 * SERVICIO DE API KEYS
 * Módulo: IAM
 * ========================================
 * Gestión de API Keys para autenticación SaaS
 *
 * SECURITY MODEL:
 *  - La key en claro (rawKey) NUNCA se persiste en BD.
 *  - Se almacena keyHash = SHA-256(rawKey) para lookup.
 *  - Se almacena keyPrefix (12 chars) solo para mostrar al usuario.
 *  - La comparación usa timingSafeEqual para prevenir timing attacks.
 */

const { prisma } = require('../../../shared/db');
const crypto = require('crypto');

/**
 * Genera el hash SHA-256 de una API Key
 * @param {string} rawKey - Key en texto plano
 * @returns {string} SHA-256 hex digest
 */
const hashApiKey = (rawKey) => {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
};

/**
 * Compara dos strings de forma segura en tiempo constante
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const safeCompare = (a, b) => {
    try {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        // timingSafeEqual requiere mismo length; si difieren → falso seguro
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
};

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
    const rawKey = `${prefix}${randomPart}`;

    // Derivar hash y prefix para almacenamiento
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.substring(0, 16); // "sk_test_" (8) + 8 chars = suficiente para identificar

    const apiKey = await prisma.apiKey.create({
        data: {
            tenantId,
            keyHash,
            keyPrefix,
            nombre,
            ambiente,
            permisos,
            rateLimit,
        },
    });

    // rawKey se retorna SOLO aquí — no se vuelve a leer de la BD
    return {
        ...apiKey,
        keySecreta: rawKey,
    };
};

/**
 * Valida una API Key y retorna el contexto del tenant asociado
 * @param {string} rawKey - API Key en texto plano recibida del cliente
 * @returns {Promise<object|null>} Contexto del tenant o null si no es válida
 */
const validar = async (rawKey) => {
    if (!rawKey || typeof rawKey !== 'string') {
        return null;
    }

    // Calcular el hash del input para buscarlo en BD
    const candidateHash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: candidateHash },
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

    // Doble verificación en tiempo constante (defense in depth)
    if (!safeCompare(candidateHash, apiKey.keyHash)) {
        return null;
    }

    // Actualizar último uso de forma async (sin bloquear la respuesta)
    prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { ultimoUso: new Date() },
    }).catch(() => {}); // fire-and-forget; no critico si falla

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
 * Lista las API Keys de un tenant (sin exponer hash ni key real)
 */
const listar = async (tenantId) => {
    const keys = await prisma.apiKey.findMany({
        where: { tenantId },
        select: {
            id: true,
            nombre: true,
            keyPrefix: true,  // Solo los primeros chars para mostrar "sk_test_a3f9..."
            ambiente: true,
            permisos: true,
            rateLimit: true,
            activo: true,
            ultimoUso: true,
            createdAt: true,
            // keyHash NUNCA se incluye en respuestas HTTP
        },
        orderBy: { createdAt: 'desc' },
    });

    return keys;
};

/**
 * Revoca (desactiva) una API Key verificando que pertenezca al tenant
 * @param {string} apiKeyId - ID de la API Key a revocar
 * @param {string} tenantId - ID del tenant que realiza la operación (ownership check)
 * @throws {NotFoundError} Si la key no existe o no pertenece al tenant
 */
const revocar = async (apiKeyId, tenantId) => {
    // El where compuesto garantiza que solo el dueño puede revocar
    const updated = await prisma.apiKey.updateMany({
        where: { id: apiKeyId, tenantId },
        data: { activo: false },
    });

    if (updated.count === 0) {
        // No distinguimos "no existe" de "no pertenece" para evitar oracle
        const { NotFoundError } = require('../../../shared/errors');
        throw new NotFoundError(
            `API Key ${apiKeyId} no encontrada o no pertenece a este tenant`,
            'API_KEY_NOT_FOUND'
        );
    }
};

module.exports = {
    crear,
    validar,
    listar,
    revocar,
    hashApiKey, // Exportado para el script de migración
};
