/**
 * ========================================
 * DTO: FACTURA DE EXPORTACIÓN (DTE-11)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Factura de Exportación (FEX)
 * NOTA: Receptor internacional, Emisor de exportación
 */

const { z } = require('zod');
const { emailSchema } = require('./base.schema');

/**
 * Tipo de Item para Exportación: 1=Bienes, 2=Servicios, 3=Ambos
 */
const tipoItemExporSchema = z.number().int().min(1).max(3).default(1);

/**
 * Receptor Internacional para FEX
 */
const receptorFEXSchema = z.object({
    nombre: z.string().min(1, 'Nombre de receptor requerido').max(200),
    codPais: z.string().min(1, 'Código de país requerido').max(6).default('9320'),
    nombrePais: z.string().min(1, 'Nombre de país requerido').max(50).default('ESTADOS UNIDOS'),
    complemento: z.string().min(1, 'Dirección requerida').max(300),
    tipoDocumento: z.string().default('36'),
    numDocumento: z.string().optional(),
    nombreComercial: z.string().nullable().optional(),
    tipoPersona: z.number().int().min(1).max(2).default(1), // 1=Jurídica, 2=Natural
    descActividad: z.string().optional(),
    telefono: z.string().nullable().optional(),
    correo: z.union([emailSchema, z.string().max(0)]).nullable().optional(), // Puede ser email vacío o null
});

/**
 * Datos Extra para FEX (Emisor y Resumen)
 */
const datosExportacionSchema = z.object({
    tipoItemExpor: tipoItemExporSchema,
    recintoFiscal: z.string().nullable().optional(),
    regimen: z.string().nullable().optional(),
    seguro: z.number().nonnegative().optional().default(0),
    flete: z.number().nonnegative().optional().default(0),
    codIncoterms: z.string().nullable().optional(),
    descIncoterms: z.string().nullable().optional(),
    observaciones: z.string().max(500).nullable().optional(),
});

/**
 * Ítem de Exportación (Permite noGravado)
 */
const itemFEXSchema = z.object({
    codigo: z.string().max(25).optional(),
    descripcion: z.string().min(1, 'Descripción requerida').max(1000),
    cantidad: z.number().positive('Cantidad debe ser positiva').max(999999999),
    precioUnitario: z.number().nonnegative('Precio no negativo'),
    descuento: z.number().nonnegative('Descuento no negativo').default(0),
    uniMedida: z.number().int().default(59),
    noGravado: z.number().default(0),
});

/**
 * Schema completo para crear Factura de Exportación
 */
const crearFEXSchema = z.object({
    tipoDte: z.literal('11').default('11'),
    receptor: receptorFEXSchema,
    items: z.array(itemFEXSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),
    condicionOperacion: z.number().int().min(1).max(3).default(1),
    datosExportacion: datosExportacionSchema.optional().default({}),
});

/**
 * Valida datos de entrada para FEX
 */
const validarFEX = (datos) => {
    const resultado = crearFEXSchema.safeParse(datos);

    if (resultado.success) {
        return {
            exito: true,
            datos: resultado.data,
        };
    }

    return {
        exito: false,
        errores: (resultado.error?.issues || []).map(e => ({
            campo: e.path.join('.'),
            mensaje: e.message,
        })),
    };
};

module.exports = {
    crearFEXSchema,
    validarFEX,
};
