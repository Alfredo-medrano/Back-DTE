/**
 * ========================================
 * CONTROLADOR DE REGISTRO
 * Módulo: Auth
 * ========================================
 * Endpoint de registro completo para nuevos
 * clientes SaaS que ya adquirieron un plan.
 *
 * Flujo:
 *  1. Validar DTO con Zod
 *  2. Verificar NIT no duplicado
 *  3. Autenticar contra API de Hacienda
 *  4. Crear Tenant con plan seleccionado
 *  5. Crear Emisor con datos fiscales reales
 *  6. Generar API Key automática
 *  7. Emitir JWT de sesión
 */

const { mhAuthClient } = require('../../shared/integrations');
const { prisma } = require('../../shared/db');
const { tenantService } = require('../iam/services');
const { apiKeyService } = require('../iam/services');
const jwt = require('jsonwebtoken');
const logger = require('../../shared/logger');
const { registroSchema } = require('./register.schema');

/**
 * POST /api/auth/register
 * Registra un nuevo cliente (Tenant + Emisor) en el sistema.
 */
const register = async (req, res) => {
    try {
        // ── 1. Validar DTO ─────────────────────────
        const parsed = registroSchema.safeParse(req.body);
        if (!parsed.success) {
            const errores = parsed.error.errors.map(
                (e) => `${e.path.join('.')}: ${e.message}`
            );
            return res.status(400).json({
                exito: false,
                codigo: 'VALIDATION_ERROR',
                mensaje: 'Datos de registro inválidos',
                errores,
            });
        }

        const data = parsed.data;

        // Normalizar NIT: quitar guiones para buscar en BD
        const nitLimpio = data.nit.replace(/-/g, '');

        // ── 2. Verificar NIT no duplicado ──────────
        const emisorExistente = await prisma.emisor.findUnique({
            where: { nit: nitLimpio },
        });

        if (emisorExistente) {
            return res.status(409).json({
                exito: false,
                codigo: 'NIT_DUPLICADO',
                mensaje: `Ya existe una cuenta registrada con el NIT ${data.nit}. Si es tuya, utiliza "Iniciar Sesión".`,
            });
        }

        // ── 3. Verificar correo no duplicado ───────
        const tenantExistente = await prisma.tenant.findUnique({
            where: { email: data.correo },
        });

        if (tenantExistente) {
            return res.status(409).json({
                exito: false,
                codigo: 'EMAIL_DUPLICADO',
                mensaje: `Ya existe una cuenta con el correo ${data.correo}.`,
            });
        }

        // ── 4. Autenticar contra MH ────────────────
        let mhToken = null;
        try {
            const params = new URLSearchParams();
            params.append('user', nitLimpio);
            params.append('pwd', data.mhClaveApi);

            const mhResponse = await mhAuthClient.post('', params);

            if (mhResponse.data?.status !== 'OK' || !mhResponse.data?.body?.token) {
                return res.status(401).json({
                    exito: false,
                    codigo: 'MH_AUTH_FAILED',
                    mensaje: 'Las credenciales del Ministerio de Hacienda son inválidas. Verifica tu NIT y Clave API.',
                    detalles: mhResponse.data?.body?.message || null,
                });
            }

            mhToken = mhResponse.data.body.token;
        } catch (mhError) {
            logger.error('Error de conexión con MH durante registro', {
                nit: nitLimpio,
                error: mhError.message,
            });
            return res.status(502).json({
                exito: false,
                codigo: 'MH_CONNECTION_ERROR',
                mensaje: 'No fue posible conectar con el Ministerio de Hacienda. Intenta de nuevo en unos minutos.',
            });
        }

        // ── 5. Crear Tenant con datos reales ───────
        const tenant = await prisma.tenant.create({
            data: {
                nombre: data.razonSocial,
                email: data.correo,
                telefono: data.telefono,
                plan: data.plan,
                activo: true,
            },
        });

        logger.info('Nuevo tenant registrado', {
            tenantId: tenant.id,
            plan: tenant.plan,
        });

        // ── 6. Crear Emisor con datos completos ────
        const emisor = await tenantService.crearEmisor(tenant.id, {
            nit: nitLimpio,
            nrc: data.nrc,
            nombre: data.razonSocial,
            nombreComercial: data.nombreComercial || null,
            codActividad: data.codActividad,
            descActividad: data.descActividad,
            departamento: data.departamento,
            municipio: data.municipio,
            complemento: data.complemento,
            telefono: data.telefono,
            correo: data.correo,
            codEstableMH: data.codEstableMH,
            codPuntoVentaMH: data.codPuntoVentaMH,
            mhClaveApi: data.mhClaveApi,
            mhClavePrivada: 'PENDIENTE_PFX', // Se configura después en Admin Panel
            ambiente: data.ambiente,
        });

        logger.info('Emisor registrado para tenant', {
            tenantId: tenant.id,
            emisorId: emisor.id,
            nit: nitLimpio,
        });

        // ── 7. Generar API Key automática ──────────
        const apiKey = await apiKeyService.crear(tenant.id, {
            nombre: 'Key Automática (Registro)',
            ambiente: data.ambiente,
            permisos: ['dte:create', 'dte:read'],
        });

        // ── 8. Emitir JWT (SECURITY FIX C1: solo cookie httpOnly) ──
        const token = jwt.sign(
            { tenantId: tenant.id, emisorId: emisor.id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // SECURITY FIX (C1): Token ONLY via httpOnly cookie — never in response body
        res.cookie('dte_api_key', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24h
        });

        res.cookie('dte_emisor_id', emisor.id, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000,
        });

        // ── 9. Respuesta exitosa ───────────────────
        // No devolver credenciales sensibles ni token en body
        const { mhClaveApi, mhClavePrivada, ...emisorSeguro } = emisor;

        return res.status(201).json({
            exito: true,
            mensaje: 'Cuenta creada exitosamente. ¡Bienvenido al sistema DTE!',
            tenant: {
                id: tenant.id,
                nombre: tenant.nombre,
                plan: tenant.plan,
            },
            emisor: emisorSeguro,
            apiKey: {
                id: apiKey.id,
                nombre: apiKey.nombre,
                key: apiKey.keySecreta, // Solo se muestra UNA VEZ
            },
        });
    } catch (error) {
        logger.error('Error en registro de cliente', {
            error: error.message,
            stack: error.stack,
        });

        // Manejar errores de unicidad de Prisma
        if (error.code === 'P2002') {
            const campo = error.meta?.target?.[0] || 'campo';
            return res.status(409).json({
                exito: false,
                codigo: 'DUPLICADO',
                mensaje: `Ya existe un registro con ese ${campo}.`,
            });
        }

        return res.status(500).json({
            exito: false,
            codigo: 'INTERNAL_ERROR',
            mensaje: 'Error interno durante el registro. Intenta de nuevo.',
        });
    }
};

module.exports = { register };
