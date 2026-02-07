/**
 * ========================================
 * GENERADOR DE IDENTIFICADORES ÚNICOS
 * Arquitectura MVC Modular
 * ========================================
 * Genera identificadores requeridos por el MH:
 * - Código de Generación (UUID)
 * - Número de Control (Correlativo DTE)
 * 
 * Migrado desde: src/utils/generadorUUID.js
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Genera un UUID v4 en mayúsculas (Código de Generación)
 * Formato requerido por MH: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 * @returns {string} UUID en mayúsculas
 */
const generarCodigoGeneracion = () => {
    return uuidv4().toUpperCase();
};

/**
 * Genera el Número de Control (correlativo)
 * Formato: DTE-TT-XXXXXXXX-NNNNNNNNNNNNNNN
 * Donde:
 *   TT = Tipo de documento (01=Factura, 03=CCF, etc.)
 *   XXXXXXXX = Código de establecimiento (8 dígitos)
 *   NNNNNNNNNNNNNNN = Correlativo (15 dígitos)
 * 
 * @param {string} tipoDocumento - Código del tipo de documento
 * @param {string} codigoEstablecimiento - Código del establecimiento
 * @param {number} correlativo - Número correlativo
 * @returns {string} Número de control formateado
 */
const generarNumeroControl = (tipoDocumento, codigoEstablecimiento, correlativo) => {
    const prefijo = 'DTE';
    const tipo = tipoDocumento.padStart(2, '0');
    const establecimiento = codigoEstablecimiento.substring(0, 8).padEnd(8, '0');
    const numCorrelativo = correlativo.toString().padStart(15, '0');

    return `${prefijo}-${tipo}-${establecimiento}-${numCorrelativo}`;
};

module.exports = {
    generarCodigoGeneracion,
    generarNumeroControl,
};
