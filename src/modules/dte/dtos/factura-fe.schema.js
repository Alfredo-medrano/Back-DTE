/**
 * ========================================
 * DTO: FACTURA ELECTRÓNICA (DTE-01)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Factura al Consumidor Final
 */

const { z } = require('zod');
const {
    receptorFESchema,
    itemSchema,
    condicionOperacionSchema,
} = require('./base.schema');

/**
 * Schema completo para crear Factura Electrónica
 */
const crearFacturaFESchema = z.object({
    tipoDte: z.literal('01').default('01'),

    receptor: receptorFESchema,

    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),

    condicionOperacion: condicionOperacionSchema,

    // Opcionales
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
 * Valida datos de entrada para FE
 * @param {object} datos - Datos a validar
 * @returns {{ exito: boolean, datos?: object, errores?: array }}
 */
const validarFacturaFE = (datos) => {
    const resultado = crearFacturaFESchema.safeParse(datos);

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
    crearFacturaFESchema,
    validarFacturaFE,
};
