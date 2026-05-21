/**
 * ========================================
 * SCHEMA DE REGISTRO — Validación Zod
 * Módulo: Auth
 * ========================================
 * Valida el DTO completo de registro de un
 * nuevo cliente (Tenant + Emisor) post-compra.
 *
 * Campos requeridos para crear un Tenant funcional
 * sin datos placeholder.
 */

const { z } = require('zod');

const registroSchema = z.object({
    // ── Datos de Empresa ──────────────────────────
    razonSocial: z.string()
        .min(2, 'Razón social debe tener al menos 2 caracteres')
        .max(200, 'Razón social máximo 200 caracteres')
        .trim(),

    nombreComercial: z.string()
        .max(200, 'Nombre comercial máximo 200 caracteres')
        .trim()
        .optional()
        .nullable(),

    nit: z.string()
        .regex(
            /^\d{4}-\d{6}-\d{3}-\d{1}$/,
            'Formato de NIT inválido. Usar: 0000-000000-000-0'
        ),

    nrc: z.string()
        .min(1, 'NRC es requerido')
        .max(10, 'NRC máximo 10 caracteres')
        .trim(),

    // ── Actividad Económica ───────────────────────
    codActividad: z.string()
        .min(1, 'Código de actividad económica requerido')
        .max(10, 'Código de actividad máximo 10 caracteres'),

    descActividad: z.string()
        .min(1, 'Descripción de actividad económica requerida')
        .max(200, 'Descripción máximo 200 caracteres')
        .trim(),

    // ── Dirección Fiscal ──────────────────────────
    departamento: z.string()
        .length(2, 'Código de departamento debe ser 2 dígitos')
        .regex(/^\d{2}$/, 'Código de departamento inválido'),

    municipio: z.string()
        .min(2, 'Código de municipio requerido')
        .max(3, 'Código de municipio máximo 3 dígitos')
        .regex(/^\d{2,3}$/, 'Código de municipio inválido'),

    complemento: z.string()
        .min(5, 'Dirección debe tener al menos 5 caracteres')
        .max(200, 'Dirección máximo 200 caracteres')
        .trim(),

    // ── Contacto ──────────────────────────────────
    telefono: z.string()
        .regex(/^\d{8}$/, 'Teléfono debe tener 8 dígitos'),

    correo: z.string()
        .email('Correo electrónico inválido')
        .max(200, 'Correo máximo 200 caracteres')
        .trim()
        .toLowerCase(),

    // ── Credenciales MH ───────────────────────────
    mhClaveApi: z.string()
        .min(1, 'Clave API de Hacienda es requerida'),

    // ── Plan ──────────────────────────────────────
    plan: z.enum(
        ['BASICO', 'PROFESIONAL', 'EMPRESARIAL', 'ILIMITADO'],
        { errorMap: () => ({ message: 'Plan inválido' }) }
    ),

    // ── Códigos de Establecimiento MH (opcionales) ─
    codEstableMH: z.string()
        .max(4, 'Código de establecimiento máximo 4 caracteres')
        .optional()
        .default('M001'),

    codPuntoVentaMH: z.string()
        .max(4, 'Código de punto de venta máximo 4 caracteres')
        .optional()
        .default('P001'),

    // ── Ambiente ──────────────────────────────────
    ambiente: z.enum(['00', '01'])
        .optional()
        .default('00'),
});

module.exports = { registroSchema };
