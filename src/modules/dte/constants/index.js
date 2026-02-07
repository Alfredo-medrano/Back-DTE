/**
 * ========================================
 * ÍNDICE DE CONSTANTES DTE
 * Módulo: DTE
 * ========================================
 */

const { TIPOS_DTE, CODIGO_IVA, DESCRIPCION_IVA, TASA_IVA } = require('./dte-types');
const { IVA_RATE, RETENCION_RENTA_RATE, LIMITE_RETENCION } = require('./tax-rates');

/**
 * Obtiene la configuración de un tipo de DTE
 * @param {string} tipoDte - Código del tipo de DTE (01, 03, 05, etc.)
 * @returns {object|null} Configuración del DTE o null si no existe
 */
const obtenerConfigDTE = (tipoDte) => {
    return TIPOS_DTE[tipoDte] || null;
};

/**
 * Obtiene la versión del schema para un tipo de DTE
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {number} Versión del schema (1, 2 o 3)
 */
const obtenerVersionDTE = (tipoDte) => {
    const config = TIPOS_DTE[tipoDte];
    return config ? config.version : 1;
};

/**
 * Verifica si el precio incluye IVA para un tipo de DTE
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {boolean} true si el precio incluye IVA
 */
const precioIncluyeIVA = (tipoDte) => {
    const config = TIPOS_DTE[tipoDte];
    return config ? config.precioIncluyeIVA : false;
};

/**
 * Verifica si el tipo de DTE usa array de tributos
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {boolean} true si usa tributos
 */
const usaTributos = (tipoDte) => {
    const config = TIPOS_DTE[tipoDte];
    return config ? config.usaTributos : false;
};

/**
 * Genera el array de tributos para cuerpoDocumento
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {array|null} Array con código de tributo o null
 */
const generarTributosCuerpo = (tipoDte) => {
    const config = TIPOS_DTE[tipoDte];
    if (config && config.usaTributos) {
        return [config.codigoTributoIVA || CODIGO_IVA];
    }
    return null;
};

/**
 * Genera el objeto de tributos para resumen
 * @param {string} tipoDte - Código del tipo de DTE
 * @param {number} valorIva - Valor total del IVA
 * @returns {array|null} Array con objeto tributo o null
 */
const generarTributosResumen = (tipoDte, valorIva) => {
    const config = TIPOS_DTE[tipoDte];
    if (config && config.usaTributos) {
        return [{
            codigo: config.codigoTributoIVA || CODIGO_IVA,
            descripcion: DESCRIPCION_IVA,
            valor: valorIva,
        }];
    }
    return null;
};

/**
 * Lista todos los tipos de DTE soportados
 * @returns {array} Array con objetos {codigo, nombre}
 */
const listarTiposDTE = () => {
    return Object.values(TIPOS_DTE).map(config => ({
        codigo: config.codigo,
        nombre: config.nombre,
        version: config.version,
        obligatorio: config.obligatorio,
    }));
};

module.exports = {
    // Catálogo
    TIPOS_DTE,

    // Constantes IVA
    CODIGO_IVA,
    DESCRIPCION_IVA,
    TASA_IVA,
    IVA_RATE,

    // Constantes retención
    RETENCION_RENTA_RATE,
    LIMITE_RETENCION,

    // Helpers
    obtenerConfigDTE,
    obtenerVersionDTE,
    precioIncluyeIVA,
    usaTributos,
    generarTributosCuerpo,
    generarTributosResumen,
    listarTiposDTE,
};
