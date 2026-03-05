/**
 * ========================================
 * DTO: FACTURA SUJETO EXCLUIDO (DTE-14)
 * Módulo: DTE
 * ========================================
 * Schema de validación para Facturas a Sujeto Excluido
 * DIFERENCIA: Receptor usa DUI (tipo 13) y no tiene obligaciones tributarias
 */

const { z } = require('zod');
const { itemSchema, condicionOperacionSchema } = require('./base.schema');

const receptorSujetoExcluidoSchema = z.object({
    tipoDocumento: z.enum(['13', '36', '37', '03'], {
        errorMap: () => ({ message: 'Tipo de documento inválido para sujeto excluido' }),
    }).default('13'), // 13 = DUI
    numDocumento: z.string().min(1, 'Número de documento requerido'),
    nombre: z.string().min(1, 'Nombre requerido').max(250),
    codActividad: z.string().max(6).optional(),
    descActividad: z.string().max(150).optional(),
    direccion: z.object({
        departamento: z.string().length(2),
        municipio: z.string().length(2),
        complemento: z.string().max(200),
    }).optional(),
    telefono: z.string().max(30).optional(),
    correo: z.string().email().optional(),
});

const crearFSESchema = z.object({
    tipoDte: z.literal('14').default('14'),
    receptor: receptorSujetoExcluidoSchema,
    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem')
        .max(2000, 'Máximo 2000 ítems permitidos'),
    condicionOperacion: condicionOperacionSchema,
    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),
});

const validarFSE = (datos) => {
    const resultado = crearFSESchema.safeParse(datos);
    if (resultado.success) return { exito: true, datos: resultado.data };
    return {
        exito: false,
        errores: resultado.error.errors.map(e => ({ campo: e.path.join('.'), mensaje: e.message })),
    };
};

module.exports = {
    crearFSESchema,
    receptorSujetoExcluidoSchema,
    validarFSE,
};
