/**
 * ========================================
 * DTO: NOTA DE CRÉDITO (DTE-05)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Notas de Crédito
 * REQUIERE: Documento relacionado obligatorio
 */

const { z } = require('zod');
const {
    receptorBaseSchema,
    itemSchema,
    condicionOperacionSchema,
} = require('./base.schema');

/**
 * Documento relacionado OBLIGATORIO para NC
 */
const documentoRelacionadoNCSchema = z.object({
    tipoDocumento: z.enum(['01', '03'], {
        errorMap: () => ({ message: 'NC solo puede relacionarse con FE (01) o CCF (03)' }),
    }),
    tipoGeneracion: z.number().int().min(1).max(2),
    numeroDocumento: z.string().min(1, 'Número de documento relacionado requerido'),
    fechaEmision: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe tener formato YYYY-MM-DD'),
});

/**
 * Schema completo para crear Nota de Crédito
 */
const crearNotaCreditoSchema = z.object({
    tipoDte: z.literal('05').default('05'),

    receptor: receptorBaseSchema,

    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),

    condicionOperacion: condicionOperacionSchema,

    // OBLIGATORIO para NC
    documentoRelacionado: documentoRelacionadoNCSchema,

    motivoAnulacion: z.string()
        .min(1, 'Motivo de anulación/ajuste requerido')
        .max(500, 'Motivo máximo 500 caracteres'),

    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),
});

/**
 * Valida datos de entrada para NC
 */
const validarNotaCredito = (datos) => {
    const resultado = crearNotaCreditoSchema.safeParse(datos);

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
    crearNotaCreditoSchema,
    documentoRelacionadoNCSchema,
    validarNotaCredito,
};
