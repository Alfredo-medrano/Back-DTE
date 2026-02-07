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
const CRYPTO_KEY = process.env.CRYPTO_SECRET_KEY || 'default_key_change_in_production_32bytes';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encripta un valor sensible
 */
const encriptar = (texto) => {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(CRYPTO_KEY.substring(0, 32).padEnd(32, '0'));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

/**
 * Desencripta un valor sensible
 */
const desencriptar = (textoEncriptado) => {
    const parts = textoEncriptado.split(':');
    if (parts.length !== 2) return textoEncriptado; // No está encriptado

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = Buffer.from(CRYPTO_KEY.substring(0, 32).padEnd(32, '0'));
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
    return await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
            emisores: {
                where: { activo: true },
            },
        },
    });
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
