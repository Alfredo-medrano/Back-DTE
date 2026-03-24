/**
 * ========================================
 * DTO: NOTA DE REMISIÓN (DTE-04)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Nota de Remisión (NR)
 * NOTA: El receptor usa numDocumento (y opcionalmente nrc) y requiere bienTitulo
 */

const { z } = require('zod');
const {
    receptorBaseSchema,
    itemSchema,
    condicionOperacionSchema,
} = require('./base.schema');

/**
 * Receptor para NR (Requiere bienTitulo)
 */
const receptorNRSchema = receptorBaseSchema.extend({
    bienTitulo: z.string()
        .length(2, 'bienTitulo debe tener 2 caracteres')
        .default('02'), // 01=Consignación, 02=Otro
});

/**
 * Schema completo para crear Nota de Remisión
 */
const crearNRSchema = z.object({
    tipoDte: z.literal('04').default('04'),

    receptor: receptorNRSchema,

    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),

    condicionOperacion: condicionOperacionSchema.optional(),

    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),

    documentoRelacionado: z.union([
        z.object({
            tipoDocumento: z.string(),
            tipoGeneracion: z.number().int(),
            numeroDocumento: z.string(),
            fechaEmision: z.string(),
        }),
        z.array(z.object({
            tipoDocumento: z.string(),
            tipoGeneracion: z.number().int(),
            numeroDocumento: z.string(),
            fechaEmision: z.string(),
        }))
    ]).optional(),
});

/**
 * Valida datos de entrada para NR
 */
const validarNR = (datos) => {
    const resultado = crearNRSchema.safeParse(datos);

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
    crearNRSchema,
    validarNR,
};
