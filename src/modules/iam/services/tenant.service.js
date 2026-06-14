/**
 * ========================================
 * SERVICIO DE TENANTS
 * Módulo: IAM
 * ========================================
 * Gestión de clientes SaaS y sus credenciales
 */

const { prisma } = require('../../../shared/db');
const crypto = require('crypto');

// Obtener clave de encriptación del entorno
const CRYPTO_SECRET_KEY = process.env.CRYPTO_SECRET_KEY;
const CRYPTO_SALT = process.env.CRYPTO_SALT;

if (!CRYPTO_SECRET_KEY || CRYPTO_SECRET_KEY.length < 32) {
    console.error('❌ [SECURITY] CRYPTO_SECRET_KEY no está definida o tiene menos de 32 caracteres.');
    process.exit(1);
}
if (!CRYPTO_SALT || CRYPTO_SALT.length < 32) {
    console.error('❌ [SECURITY] CRYPTO_SALT no está definida o tiene menos de 32 caracteres.');
    process.exit(1);
}

// Derivar clave AES-256 con scrypt (una sola vez al arrancar)
// scrypt previene ataques de fuerza bruta y dict attack sobre la master key
const GCM_KEY = crypto.scryptSync(
    CRYPTO_SECRET_KEY,
    Buffer.from(CRYPTO_SALT, 'hex'),
    32  // 256 bits
);

const ALGORITHM_GCM = 'aes-256-gcm';
// Mantenido solo para desencriptar registros legacy (AES-CBC)
const ALGORITHM_CBC = 'aes-256-cbc';

/**
 * Encripta un valor sensible con AES-256-GCM
 * Formato de salida: iv_hex:authTag_hex:ciphertext_hex
 *
 * GCM incluye autenticación integrada (AEAD), eliminando
 * la vulnerabilidad de padding oracle presente en AES-CBC.
 */
const encriptar = (texto) => {
    const iv = crypto.randomBytes(12); // 96 bits recomendado para GCM
    const cipher = crypto.createCipheriv(ALGORITHM_GCM, GCM_KEY, iv);
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Formato: iv:authTag:ciphertext (3 partes → identifica GCM)
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Desencripta un valor sensible.
 * Soporta tanto GCM (nuevo, 3 partes) como CBC (legacy, 2 partes).
 * Los registros CBC deben ser migrados con scripts/migrate-encryption.js
 */
const desencriptar = (textoEncriptado) => {
    if (!textoEncriptado) return textoEncriptado;

    const parts = textoEncriptado.split(':');

    if (parts.length === 3) {
        // Formato GCM: iv:authTag:ciphertext
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv(ALGORITHM_GCM, GCM_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    if (parts.length === 2) {
        // Formato CBC legacy: iv:ciphertext
        // DEPRECADO — solo para compatibilidad durante migración
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        // La clave CBC usaba padEnd(32, '0') — reproducimos solo para descifrar
        const cbcKey = Buffer.from(CRYPTO_SECRET_KEY.substring(0, 32).padEnd(32, '0'));
        const decipher = crypto.createDecipheriv(ALGORITHM_CBC, cbcKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // No encriptado (ej. valor en texto plano legacy)
    return textoEncriptado;
};

/**
 * Crea un nuevo tenant
 * @param {object} datos - Datos del tenant
 * @returns {Promise<object>} Tenant creado
 */
const crear = async (datos) => {
    const {
        nombre,
        email,
        telefono,
        plan = 'BASICO',
    } = datos;

    const tenant = await prisma.tenant.create({
        data: {
            nombre,
            email,
            telefono,
            plan,
        },
    });

    return tenant;
};

/**
 * Crea un emisor para un tenant
 * @param {string} tenantId - ID del tenant
 * @param {object} datosEmisor - Datos del emisor
 * @returns {Promise<object>} Emisor creado
 */
const crearEmisor = async (tenantId, datosEmisor) => {
    const {
        nit,
        nrc,
        nombre,
        nombreComercial,
        codActividad,
        descActividad,
        departamento,
        municipio,
        complemento,
        telefono,
        correo,
        codEstableMH,
        codPuntoVentaMH,
        mhClaveApi,
        mhClavePrivada,
        ambiente = '00',
    } = datosEmisor;

    // Encriptar credenciales MH
    const claveApiEncriptada = encriptar(mhClaveApi);
    const clavePrivadaEncriptada = encriptar(mhClavePrivada);

    const emisor = await prisma.emisor.create({
        data: {
            tenantId,
            nit,
            nrc,
            nombre,
            nombreComercial,
            codActividad,
            descActividad,
            departamento: departamento || '06',
            municipio: municipio || '14',
            complemento,
            telefono,
            correo,
            codEstableMH: codEstableMH || 'M001',
            codPuntoVentaMH: codPuntoVentaMH || 'P001',
            mhClaveApi: claveApiEncriptada,
            mhClavePrivada: clavePrivadaEncriptada,
            ambiente,
        },
    });

    return emisor;
};

/**
 * Obtiene un tenant por ID
 */
const obtenerPorId = async (tenantId) => {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
            emisores: {
                where: { activo: true },
                select: {
                    id: true,
                    tenantId: true,
                    nit: true,
                    nrc: true,
                    nombre: true,
                    nombreComercial: true,
                    codActividad: true,
                    descActividad: true,
                    departamento: true,
                    municipio: true,
                    complemento: true,
                    telefono: true,
                    correo: true,
                    codEstableMH: true,
                    codPuntoVentaMH: true,
                    tipoEstablecimiento: true,
                    ambiente: true,
                    activo: true,
                    certUploadedAt: true,
                    correlativoFE: true,
                    correlativoCCF: true,
                    correlativoNC: true,
                    correlativoND: true,
                    correlativoFSE: true,
                    correlativoFEX: true,
                    createdAt: true,
                    updatedAt: true,
                    // mhClaveApi y mhClavePrivada NUNCA en respuestas HTTP
                },
            },
        },
    });
    return tenant;
};

/**
 * Obtiene un emisor con credenciales desencriptadas
 * @param {string} emisorId - ID del emisor
 * @returns {Promise<object>} Emisor con credenciales desencriptadas
 */
const obtenerEmisorConCredenciales = async (emisorId) => {
    const emisor = await prisma.emisor.findUnique({
        where: { id: emisorId },
    });

    if (!emisor) return null;

    // Desencriptar credenciales solo cuando se necesitan
    return {
        ...emisor,
        mhClaveApi: desencriptar(emisor.mhClaveApi),
        mhClavePrivada: desencriptar(emisor.mhClavePrivada),
    };
};

/**
 * Obtiene el siguiente correlativo para un tipo de DTE
 * y lo incrementa atómicamente
 */
const obtenerSiguienteCorrelativo = async (emisorId, tipoDte) => {
    const campoCorrelativo = {
        '01': 'correlativoFE',
        '03': 'correlativoCCF',
        '04': 'correlativoNR',
        '05': 'correlativoNC',
        '06': 'correlativoND',
        '11': 'correlativoFEX',
        '14': 'correlativoFSE',
    };

    const campo = campoCorrelativo[tipoDte] || 'correlativoFE';

    // Incrementar atómicamente
    const emisor = await prisma.emisor.update({
        where: { id: emisorId },
        data: {
            [campo]: { increment: 1 },
        },
    });

    return emisor[campo];
};

/**
 * Lista todos los tenants
 */
const listar = async () => {
    return await prisma.tenant.findMany({
        where: { activo: true },
        include: {
            _count: {
                select: { emisores: true, apiKeys: true, dtes: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
};

module.exports = {
    crear,
    crearEmisor,
    obtenerPorId,
    obtenerEmisorConCredenciales,
    obtenerSiguienteCorrelativo,
    listar,
    encriptar,
    desencriptar,
};
