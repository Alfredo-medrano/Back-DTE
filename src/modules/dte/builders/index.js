/**
 * ========================================
 * ÍNDICE DE BUILDERS
 * Módulo: DTE
 * ========================================
 * Patrón Builder para construcción de DTEs
 */

const baseBuilder = require('./base.builder');
const feBuilder = require('./fe.builder');
const ccfBuilder = require('./ccf.builder');
const ncBuilder = require('./nc.builder');
const ndBuilder = require('./nd.builder');
const fseBuilder = require('./fse.builder');

/**
 * Mapa de builders por tipo DTE
 */
const builders = {
    '01': feBuilder,
    '03': ccfBuilder,
    '05': ncBuilder,
    '06': ndBuilder,
    '14': fseBuilder,
};

/**
 * Obtiene el builder correspondiente al tipo DTE
 * @param {string} tipoDte - Tipo de DTE (01, 03, 05, 06, 14)
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
        throw new Error(`Tipo DTE '${tipoDte}' no soportado. Tipos disponibles: ${Object.keys(builders).join(', ')}`);
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
    baseBuilder,
    feBuilder,
    ccfBuilder,
    ncBuilder,
    ndBuilder,
    fseBuilder,

    // Helpers
    obtenerBuilder,
    construirDocumento,
    tiposSoportados,
};
