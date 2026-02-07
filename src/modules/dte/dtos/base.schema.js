/**
 * ========================================
 * DTOs BASE - SCHEMAS COMUNES
 * Módulo: DTE
 * ========================================
 * Schemas Zod reutilizables para todos los tipos de DTE
 */

const { z } = require('zod');

// ========================================
// PRIMITIVOS SALVADOREÑOS
// ========================================

/**
 * NIT/NRC: 14 dígitos máximo
 */
const nitSchema = z.string()
    .min(9, 'NIT debe tener mínimo 9 dígitos')
    .max(14, 'NIT debe tener máximo 14 dígitos')
    .regex(/^\d+$/, 'NIT solo debe contener números');

const nrcSchema = z.string()
    .min(1, 'NRC requerido')
    .max(10, 'NRC máximo 10 caracteres')
    .regex(/^[\d-]+$/, 'NRC formato inválido');

/**
 * DUI: formato 00000000-0
 */
const duiSchema = z.string()
    .regex(/^\d{8}-\d$/, 'DUI debe tener formato 00000000-0');

/**
 * Email válido
 */
const emailSchema = z.string().email('Correo electrónico inválido');

/**
 * Teléfono: 8 dígitos
 */
const telefonoSchema = z.string()
    .regex(/^\d{8}$/, 'Teléfono debe tener 8 dígitos');

/**
 * Códigos de departamento (01-14)
 */
const departamentoSchema = z.string()
    .length(2, 'Código departamento debe ser 2 dígitos')
    .regex(/^(0[1-9]|1[0-4])$/, 'Departamento inválido (01-14)');

/**
 * Códigos de municipio
 */
const municipioSchema = z.string()
    .min(2, 'Código municipio requerido')
    .max(3, 'Código municipio máximo 3 dígitos');

// ========================================
// DIRECCIÓN
// ========================================

const direccionSchema = z.object({
    departamento: departamentoSchema.default('06'),
    municipio: municipioSchema.default('14'),
    complemento: z.string()
        .min(1, 'Complemento de dirección requerido')
        .max(200, 'Complemento máximo 200 caracteres'),
});

// ========================================
// RECEPTOR (CLIENTE)
// ========================================

/**
 * Tipos de documento del receptor
 * 36 = NIT, 13 = DUI, 37 = Otro, 03 = Pasaporte
 */
const tipoDocumentoReceptorSchema = z.enum(['36', '13', '37', '03'], {
    errorMap: () => ({ message: 'Tipo documento inválido (36=NIT, 13=DUI, 37=Otro, 03=Pasaporte)' }),
});

const receptorBaseSchema = z.object({
    tipoDocumento: tipoDocumentoReceptorSchema.default('36'),
    numDocumento: z.string().min(1, 'Número de documento requerido'),
    nombre: z.string()
        .min(1, 'Nombre del receptor requerido')
        .max(200, 'Nombre máximo 200 caracteres'),
    direccion: direccionSchema.optional(),
    telefono: telefonoSchema.optional(),
    correo: emailSchema,
});

/**
 * Receptor para FE (Factura Consumidor Final)
 */
const receptorFESchema = receptorBaseSchema;

/**
 * Receptor para CCF (debe tener NRC)
 */
const receptorCCFSchema = receptorBaseSchema.extend({
    nrc: nrcSchema,
    codActividad: z.string().min(1, 'Código actividad requerido'),
    descActividad: z.string().min(1, 'Descripción actividad requerida'),
});

// ========================================
// ITEM / PRODUCTO
// ========================================

/**
 * Tipo de ítem: 1=Producto, 2=Servicio, 3=Ambos, 4=Otro
 */
const tipoItemSchema = z.number()
    .int()
    .min(1)
    .max(4)
    .default(1);

const itemSchema = z.object({
    codigo: z.string()
        .max(25, 'Código máximo 25 caracteres')
        .optional(),
    descripcion: z.string()
        .min(1, 'Descripción requerida')
        .max(1000, 'Descripción máximo 1000 caracteres'),
    cantidad: z.number()
        .positive('Cantidad debe ser positiva')
        .max(999999999, 'Cantidad excede límite'),
    precioUnitario: z.number()
        .nonnegative('Precio no puede ser negativo')
        .max(999999999.99, 'Precio excede límite'),
    descuento: z.number()
        .nonnegative('Descuento no puede ser negativo')
        .default(0),
    tipoItem: tipoItemSchema,
    uniMedida: z.number().int().default(99), // 99 = Otra
    tributos: z.array(z.string()).optional(),
});

// ========================================
// CONDICIÓN DE OPERACIÓN
// ========================================

/**
 * 1=Contado, 2=Crédito, 3=Otro
 */
const condicionOperacionSchema = z.number()
    .int()
    .min(1)
    .max(3)
    .default(1);

// ========================================
// TIPOS DE DTE
// ========================================

const tipoDteSchema = z.enum(['01', '03', '05', '06', '11', '14'], {
    errorMap: () => ({ message: 'Tipo DTE inválido (01, 03, 05, 06, 11, 14)' }),
});

// ========================================
// EXPORTS
// ========================================

module.exports = {
    // Primitivos
    nitSchema,
    nrcSchema,
    duiSchema,
    emailSchema,
    telefonoSchema,
    departamentoSchema,
    municipioSchema,

    // Complejos
    direccionSchema,
    receptorBaseSchema,
    receptorFESchema,
    receptorCCFSchema,
    itemSchema,

    // Enums
    tipoDocumentoReceptorSchema,
    tipoItemSchema,
    condicionOperacionSchema,
    tipoDteSchema,
};
