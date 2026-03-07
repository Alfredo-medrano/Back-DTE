/**
 * ========================================
 * DTO: NOTA DE DÉBITO (DTE-06)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Notas de Débito
 * REQUIERE: documentoRelacionado obligatorio
 */

const { z } = require('zod');
const {
    receptorBaseSchema,
    itemSchema,
    condicionOperacionSchema,
} = require('./base.schema');

const documentoRelacionadoNDSchema = z.object({
    tipoDocumento: z.enum(['03', '07'], {
        errorMap: () => ({ message: 'ND solo puede relacionarse con CCF (03) o Nota de Remisión (07)' }),
    }),
    tipoGeneracion: z.number().int().min(1).max(2),
    numeroDocumento: z.string().min(1, 'Número de documento relacionado requerido'),
    fechaEmision: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe tener formato YYYY-MM-DD'),
});

const crearNotaDebitoSchema = z.object({
    tipoDte: z.literal('06').default('06'),
    receptor: receptorBaseSchema,
    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),
    condicionOperacion: condicionOperacionSchema,
    documentoRelacionado: documentoRelacionadoNDSchema,
    motivoAjuste: z.string()
        .max(500, 'Motivo máximo 500 caracteres')
        .optional(),
    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),
});

const validarNotaDebito = (datos) => {
    const resultado = crearNotaDebitoSchema.safeParse(datos);
    if (resultado.success) return { exito: true, datos: resultado.data };
    return {
        exito: false,
        errores: (resultado.error?.issues || []).map(e => ({ campo: e.path.join('.'), mensaje: e.message })),
    };
};

module.exports = {
    crearNotaDebitoSchema,
    documentoRelacionadoNDSchema,
    validarNotaDebito,
};
