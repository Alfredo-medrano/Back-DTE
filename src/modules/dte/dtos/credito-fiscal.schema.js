/**
 * ========================================
 * DTO: CRÉDITO FISCAL (DTE-03)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Crédito Fiscal (CCF)
 * NOTA: El receptor DEBE tener NIT/NRC válidos
 */

const { z } = require('zod');
const {
    receptorCCFSchema,
    itemSchema,
    condicionOperacionSchema,
    nrcSchema,
} = require('./base.schema');

/**
 * Schema completo para crear Crédito Fiscal
 * Diferencia clave con FE: receptor requiere NRC y actividad económica
 */
const crearCCFSchema = z.object({
    tipoDte: z.literal('03').default('03'),

    receptor: receptorCCFSchema.refine(
        (data) => data.tipoDocumento === '36',
        { message: 'CCF requiere receptor con NIT (tipoDocumento: 36)' }
    ),

    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),

    condicionOperacion: condicionOperacionSchema,

    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),

    documentoRelacionado: z.object({
        tipoDocumento: z.string(),
        tipoGeneracion: z.number().int(),
        numeroDocumento: z.string(),
        fechaEmision: z.string(),
    }).optional(),
});

/**
 * Valida datos de entrada para CCF
 */
const validarCCF = (datos) => {
    const resultado = crearCCFSchema.safeParse(datos);

    if (resultado.success) {
        return {
            exito: true,
            datos: resultado.data,
        };
    }

    return {
        exito: false,
        errores: resultado.error.errors.map(e => ({
            campo: e.path.join('.'),
            mensaje: e.message,
        })),
    };
};

module.exports = {
    crearCCFSchema,
    validarCCF,
};
