/**
 * ========================================
 * CONTROLADOR DE AUTENTICACIÓN
 * Módulo: Auth
 * ========================================
 * Login via MH SSO + Logout con limpieza de cookie.
 *
 * SECURITY FIXES:
 *  - JWT_SECRET sin fallback hardcoded (requiere env-validator).
 *  - Credenciales MH se encriptan con AES-256-GCM via tenantService.
 *  - Logout limpia cookie httpOnly del lado del servidor.
 */

const { mhAuthClient } = require('../../shared/integrations');
const { prisma } = require('../../shared/db');
const { tenantService } = require('../iam/services');
const jwt = require('jsonwebtoken');
const logger = require('../../shared/logger');

const login = async (req, res, next) => {
    try {
        const { nit, passwordApi, ambiente } = req.body;

        if (!nit || !passwordApi) {
            return res.status(400).json({ error: 'NIT y Contraseña API requeridos' });
        }

        const params = new URLSearchParams();
        params.append('user', nit);
        params.append('pwd', passwordApi);

        const response = await mhAuthClient.post('', params);

        if (response.data?.status === 'OK' && response.data?.body?.token) {
            // MH Auth successful. Find existing Emisor (NO auto-creation).
            const emisor = await prisma.emisor.findFirst({ where: { nit } });

            // SECURITY FIX (C3): Login NEVER auto-creates tenants.
            // Unregistered NITs must go through POST /api/auth/register first.
            if (!emisor) {
                return res.status(401).json({
                    exito: false,
                    codigo: 'EMISOR_NO_REGISTRADO',
                    mensaje: 'No existe una cuenta asociada a este NIT. Regístrate primero en /registro.',
                });
            }

            // Verify account is active
            if (!emisor.activo) {
                return res.status(403).json({
                    exito: false,
                    codigo: 'CUENTA_INACTIVA',
                    mensaje: 'Tu cuenta está desactivada. Contacta al administrador.',
                });
            }

            const token = jwt.sign(
                { tenantId: emisor.tenantId, emisorId: emisor.id },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            // SECURITY FIX (C1): Token ONLY via httpOnly cookie — never in response body.
            // Eliminates XSS token theft via localStorage.
            res.cookie('dte_api_key', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24h
            });

            res.cookie('dte_emisor_id', emisor.id, {
                httpOnly: false, // Frontend reads this for UI display only
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            logger.info('Login exitoso', { nit, emisorId: emisor.id });

            // SECURITY FIX (C1): No token in body — only safe, non-sensitive emisor data
            return res.json({
                exito: true,
                emisor: {
                    id: emisor.id,
                    nit: emisor.nit,
                    nombre: emisor.nombre,
                    nombreComercial: emisor.nombreComercial,
                    ambiente: emisor.ambiente,
                },
            });
        }

        return res.status(401).json({ exito: false, error: 'Credenciales MH inválidas', detalles: response.data });
    } catch (error) {
        logger.error('Error en autenticación', { error: error.message });
        return res.status(500).json({ exito: false, error: 'Error interno en autenticación' });
    }
};

/**
 * POST /api/auth/logout
 * Limpia las cookies de sesión del lado del servidor.
 * ISO 27001 A.9 — Gestión de sesiones.
 */
const logout = (req, res) => {
    res.cookie('dte_api_key', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
    });
    res.cookie('dte_emisor_id', '', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
    });

    logger.info('Logout realizado');
    return res.json({ exito: true, mensaje: 'Sesión cerrada correctamente' });
};

/**
 * GET /api/auth/me
 * Verifica la cookie de sesión y retorna info del emisor/tenant.
 * El frontend usa esto en vez de localStorage para validar sesión.
 */
const me = async (req, res) => {
    try {
        const token = req.cookies?.dte_api_key;
        if (!token) {
            return res.status(401).json({ exito: false, codigo: 'NO_SESSION' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const emisor = await prisma.emisor.findUnique({
            where: { id: decoded.emisorId },
            select: {
                id: true,
                tenantId: true,
                nit: true,
                nombre: true,
                nombreComercial: true,
                ambiente: true,
                activo: true,
                tenant: {
                    select: { id: true, nombre: true, plan: true, activo: true },
                },
            },
        });

        if (!emisor || !emisor.activo || !emisor.tenant.activo) {
            return res.status(401).json({ exito: false, codigo: 'INACTIVE_ACCOUNT' });
        }

        return res.json({
            exito: true,
            emisor,
            tenant: emisor.tenant,
        });
    } catch {
        return res.status(401).json({ exito: false, codigo: 'INVALID_SESSION' });
    }
};

module.exports = { login, logout, me };
