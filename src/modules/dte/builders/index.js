/**
 * ========================================
 * ÍNDICE DE BUILDERS
 * Módulo: DTE
 * ========================================
 * Patrón Builder para construcción de DTEs
 */

const feBuilder = require('./fe.builder');
const ccfBuilder = require('./ccf.builder');
const ncBuilder = require('./nc.builder');

/**
 * Mapa de builders por tipo DTE
 */
const builders = {
    '01': feBuilder,
    '03': ccfBuilder,
    '05': ncBuilder,
};

/**
 * Obtiene el builder correspondiente al tipo DTE
 * @param {string} tipoDte - Tipo de DTE (01, 03, 05, etc.)
 * @returns {object|null} Builder o null si no existe
 */
const obtenerBuilder = (tipoDte) => {
    return builders[tipoDte] || null;
};

/**
 * Construye un documento DTE usando el builder apropiado
 * @param {string} tipoDte - Tipo de DTE
 * @param {object} params - Parámetros del documento
 */
const construirDocumento = (tipoDte, params) => {
    const builder = obtenerBuilder(tipoDte);

    if (!builder) {
        throw new Error(`Builder no encontrado para tipo DTE: ${tipoDte}`);
    }

    return builder.construir(params);
};

/**
 * Lista los tipos de DTE soportados
 */
const tiposSoportados = () => {
    return Object.entries(builders).map(([tipo, builder]) => ({
        tipo,
        nombre: builder.nombre,
    }));
};

module.exports = {
    // Builders individuales
    feBuilder,
    ccfBuilder,
    ncBuilder,

    // Helpers
    obtenerBuilder,
    construirDocumento,
    tiposSoportados,
};
