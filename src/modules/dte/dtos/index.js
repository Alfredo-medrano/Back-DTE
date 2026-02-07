/**
 * ========================================
 * ÍNDICE DE DTOs (SCHEMAS)
 * Módulo: DTE
 * ========================================
 */

const baseSchemas = require('./base.schema');
const facturaFE = require('./factura-fe.schema');
const creditoFiscal = require('./credito-fiscal.schema');
const notaCredito = require('./nota-credito.schema');

/**
 * Selecciona el validador correcto según tipo de DTE
 */
const obtenerValidador = (tipoDte) => {
    const validadores = {
        '01': facturaFE.validarFacturaFE,
        '03': creditoFiscal.validarCCF,
        '05': notaCredito.validarNotaCredito,
    };

    return validadores[tipoDte] || null;
};

/**
 * Valida datos según tipo de DTE
 * @param {string} tipoDte - Tipo de DTE (01, 03, 05, etc.)
 * @param {object} datos - Datos a validar
 */
const validarPorTipo = (tipoDte, datos) => {
    const validador = obtenerValidador(tipoDte);

    if (!validador) {
        return {
            exito: false,
            errores: [{ campo: 'tipoDte', mensaje: `Tipo DTE '${tipoDte}' no soportado aún` }],
        };
    }

    return validador(datos);
};

module.exports = {
    // Base
    ...baseSchemas,

    // Por tipo
    facturaFE,
    creditoFiscal,
    notaCredito,

    // Helpers
    obtenerValidador,
    validarPorTipo,
};
