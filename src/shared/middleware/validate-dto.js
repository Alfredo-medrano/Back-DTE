/**
 * ========================================
 * MIDDLEWARE: VALIDATE DTO
 * ========================================
 * Valida el body de la petición usando schemas Zod
 */

const { validarPorTipo } = require('../../modules/dte/dtos');
const { BadRequestError } = require('../errors');

/**
 * Middleware de validación con schema Zod
 * @param {object} schema - Schema Zod a usar para validación
 */
const validateSchema = (schema) => {
    return (req, res, next) => {
        try {
            const resultado = schema.safeParse(req.body);

            if (!resultado.success) {
                const errores = resultado.error.errors.map(e => ({
                    campo: e.path.join('.'),
                    mensaje: e.message,
                }));

                throw new BadRequestError(
                    'Error de validación en los datos enviados',
                    'VALIDATION_ERROR',
                    errores
                );
            }

            // Datos validados y transformados
            req.validatedBody = resultado.data;
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware de validación dinámica por tipo DTE
 * Lee el tipoDte del body y aplica el schema correspondiente
 */
const validateDTE = (req, res, next) => {
    try {
        const tipoDte = req.body.tipoDte || '01';
        const resultado = validarPorTipo(tipoDte, req.body);

        if (!resultado.exito) {
            throw new BadRequestError(
                `Error de validación para DTE tipo ${tipoDte}`,
                'VALIDATION_ERROR',
                resultado.errores
            );
        }

        req.validatedBody = resultado.datos;
        req.tipoDte = tipoDte;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateSchema,
    validateDTE,
};
