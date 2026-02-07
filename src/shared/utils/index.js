/**
 * ========================================
 * ÍNDICE DE UTILIDADES
 * Arquitectura MVC Modular
 * ========================================
 */

const { generarCodigoGeneracion, generarNumeroControl } = require('./uuid-generator');
const { generarFechaActual, generarHoraEmision, generarFechaEmision, formatearFecha } = require('./date-formatter');

module.exports = {
    // UUID
    generarCodigoGeneracion,
    generarNumeroControl,

    // Fechas
    generarFechaActual,
    generarHoraEmision,
    generarFechaEmision,
    formatearFecha,
};
