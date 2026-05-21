/**
 * ========================================
 * DTO: COMPROBANTE DE DONACIÓN (DTE-15) v1
 * Módulo: DTE
 * ========================================
 * Schema de validación para Comprobante de Donación
 * DIFERENCIAS:
 *  - "receptor" aquí es el "donante" (quien dona) — puede ser anónimo
 *  - Los items representan el bien/servicio donado
 *  - Sin IVA, sin condicionOperacion en algunas versiones del schema
 */

const { z } = require('zod');
const { emailSchema, itemSchema, condicionOperacionSchema } = require('./base.schema');

/**
 * Schema del donante (receptor en términos internos del sistema)
 * Todos los campos son opcionales — el donante puede ser anónimo
 */
const donanteSchema = z.object({
    tipoDocumento: z.enum(['36', '13', '02', '03', '37'], {
        errorMap: () => ({ message: 'Tipo de documento inválido para el donante' }),
    }).default('37'),
    numDocumento: z.string().min(1).max(20).optional().default('ANON'),
    nrc: z.string().max(8).nullable().optional(),
    nombre: z.string().min(1, 'Nombre requerido').max(250).optional().default('DONANTE ANÓNIMO'),
    codActividad: z.string().max(6).nullable().optional(),
    descActividad: z.string().max(150).nullable().optional(),
    direccion: z.object({
        departamento: z.string().length(2),
        municipio: z.string().length(2),
        complemento: z.string().max(200),
    }).nullable().optional(),
    telefono: z.string().max(30).nullable().optional(),
    correo: z.union([emailSchema, z.string().max(0)]).nullable().optional(),
    codDomiciliado: z.number().int().min(1).max(2).default(1), // 1=Nacional, 2=Extranjero
    codPais: z.string().min(4).max(4).default('9320'),         // 9320 = El Salvador
}).optional();

/**
 * Schema completo para crear Comprobante de Donación
 */
const crearCDSchema = z.object({
    tipoDte: z.literal('15').default('15'),

    // El donante es opcional (donaciones anónimas son válidas)
    receptor: donanteSchema,

    items: z.array(itemSchema)
        .min(1, 'Debe incluir al menos un ítem de donación')
        .max(2000, 'Máximo 2000 ítems permitidos'),

    condicionOperacion: condicionOperacionSchema,

    observaciones: z.string()
        .max(3000, 'Observaciones máximo 3000 caracteres')
        .optional(),
});

/**
 * Valida datos de entrada para CD
 */
const validarCD = (datos) => {
    const resultado = crearCDSchema.safeParse(datos);

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
    crearCDSchema,
    donanteSchema,
    validarCD,
};
