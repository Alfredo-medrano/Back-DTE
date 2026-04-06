/**
 * ========================================
 * DTOs ADMIN - SCHEMAS ZOD
 * Módulo: IAM
 * ========================================
 * Validación de inputs para endpoints de administración
 */

const { z } = require('zod');

// ========================================
// TENANT
// ========================================

const crearTenantSchema = z.object({
    nombre: z.string()
        .min(2, 'Nombre debe tener mínimo 2 caracteres')
        .max(200, 'Nombre máximo 200 caracteres')
        .trim(),
    email: z.string()
        .email('Email inválido')
        .max(200, 'Email máximo 200 caracteres')
        .trim()
        .toLowerCase(),
    telefono: z.string()
        .regex(/^\d{8}$/, 'Teléfono debe tener 8 dígitos')
        .optional()
        .nullable(),
    plan: z.enum(['BASICO', 'PROFESIONAL', 'EMPRESARIAL', 'ILIMITADO'])
        .optional()
        .default('BASICO'),
});

// ========================================
// EMISOR
// ========================================

const crearEmisorSchema = z.object({
    nit: z.string()
        .min(9, 'NIT mínimo 9 dígitos')
        .max(14, 'NIT máximo 14 dígitos')
        .regex(/^\d+$/, 'NIT solo debe contener números'),
    nrc: z.string()
        .min(1, 'NRC requerido')
        .max(10, 'NRC máximo 10 caracteres'),
    nombre: z.string()
        .min(2, 'Nombre requerido')
        .max(200, 'Nombre máximo 200 caracteres'),
    nombreComercial: z.string().max(200).optional().nullable(),
    codActividad: z.string().min(1, 'Código actividad requerido'),
    descActividad: z.string().min(1, 'Descripción actividad requerida'),
    departamento: z.string().length(2).optional().default('06'),
    municipio: z.string().min(2).max(3).optional().default('14'),
    complemento: z.string().min(1, 'Dirección requerida').max(200),
    telefono: z.string().regex(/^\d{8}$/, 'Teléfono 8 dígitos'),
    correo: z.string().email('Correo inválido'),
    codEstableMH: z.string().max(4).optional().default('M001'),
    codPuntoVentaMH: z.string().max(4).optional().default('P001'),
    mhClaveApi: z.string().min(1, 'Clave API MH requerida'),
    mhClavePrivada: z.string().min(1, 'Clave privada MH requerida'),
    ambiente: z.enum(['00', '01']).optional().default('00'),
});

// ========================================
// API KEY
// ========================================

const crearApiKeySchema = z.object({
    nombre: z.string()
        .min(1, 'Nombre requerido')
        .max(100, 'Nombre máximo 100 caracteres')
        .optional()
        .default('Default'),
    ambiente: z.enum(['00', '01']).optional().default('00'),
    permisos: z.array(z.string()).optional().default(['dte:create', 'dte:read']),
    rateLimit: z.number().int().min(1).max(10000).optional().default(100),
});

module.exports = {
    crearTenantSchema,
    crearEmisorSchema,
    crearApiKeySchema,
};
