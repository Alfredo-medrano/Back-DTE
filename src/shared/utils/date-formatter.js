/**
 * ========================================
 * FORMATEADOR DE FECHAS
 * Arquitectura MVC Modular
 * ========================================
 * Funciones de formateo de fecha/hora para DTE
 */

/**
 * Genera fecha en formato YYYY-MM-DD
 * @returns {string} Fecha actual
 */
const generarFechaActual = () => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Genera hora en formato HH:MM:SS
 * @returns {string} Hora actual
 */
const generarHoraEmision = () => {
    return new Date().toTimeString().split(' ')[0];
};

/**
 * Genera un sello de tiempo en formato ISO 8601
 * @returns {string} Fecha y hora actual en formato ISO
 */
const generarFechaEmision = () => {
    return new Date().toISOString();
};

/**
 * Formatea una fecha a YYYY-MM-DD
 * @param {Date} fecha - Fecha a formatear
 * @returns {string} Fecha formateada
 */
const formatearFecha = (fecha) => {
    if (!(fecha instanceof Date)) {
        fecha = new Date(fecha);
    }
    return fecha.toISOString().split('T')[0];
};

module.exports = {
    generarFechaActual,
    generarHoraEmision,
    generarFechaEmision,
    formatearFecha,
};
