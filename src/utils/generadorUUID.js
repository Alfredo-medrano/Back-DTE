/**
 * ========================================
 * GENERADOR DE IDENTIFICADORES ÚNICOS
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Genera los identificadores requeridos por el MH:
 * - Código de Generación (UUID)
 * - Número de Control (Correlativo DTE)
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
 * Formato: DTE-TT-XXXXXXXX-NNNNNNNNNNNNNNNN
 * Donde:
 *   TT = Tipo de documento (01=Factura, 03=CCF, etc.)
 *   XXXXXXXX = Código de establecimiento (8 dígitos)
 *   NNNNNNNNNNNNNNNN = Correlativo (15 dígitos)
 * 
 * @param {string} tipoDocumento - Código del tipo de documento
 * @param {string} codigoEstablecimiento - Código del establecimiento
 * @param {number} correlativo - Número correlativo
 * @returns {string} Número de control formateado
 */
const generarNumeroControl = (tipoDocumento, codigoEstablecimiento, correlativo) => {
    const prefijo = 'DTE';
    const tipo = tipoDocumento.padStart(2, '0');
    const establecimiento = codigoEstablecimiento.padStart(8, '0');
    const numCorrelativo = correlativo.toString().padStart(15, '0');

    return `${prefijo}-${tipo}-${establecimiento}-${numCorrelativo}`;
};

/**
 * Genera un sello de tiempo en formato ISO 8601
 * @returns {string} Fecha y hora actual en formato ISO
 */
const generarFechaEmision = () => {
    return new Date().toISOString();
};

/**
 * Genera hora en formato HH:MM:SS
 * @returns {string} Hora actual
 */
const generarHoraEmision = () => {
    return new Date().toTimeString().split(' ')[0];
};

/**
 * Genera fecha en formato YYYY-MM-DD
 * @returns {string} Fecha actual
 */
const generarFechaActual = () => {
    return new Date().toISOString().split('T')[0];
};

module.exports = {
    generarCodigoGeneracion,
    generarNumeroControl,
    generarFechaEmision,
    generarHoraEmision,
    generarFechaActual,
};
