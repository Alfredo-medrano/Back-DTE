/**
 * ========================================
 * FORMATEADOR DE FECHAS
 * Arquitectura MVC Modular
 * ========================================
 * Funciones de formateo de fecha/hora para DTE
 * ZONA HORARIA: America/El_Salvador (CST -06:00)
 */

const TIMEZONE = 'America/El_Salvador';

/**
 * Genera fecha en formato YYYY-MM-DD (zona horaria El Salvador)
 * @returns {string} Fecha actual
 */
const generarFechaActual = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // en-CA → YYYY-MM-DD
};

/**
 * Genera hora en formato HH:MM:SS (zona horaria El Salvador)
 * @returns {string} Hora actual
 */
const generarHoraEmision = () => {
    const ahora = new Date();
    return ahora.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false }); // en-GB → HH:MM:SS
};

/**
 * Genera fecha y hora de emisión desde un SOLO timestamp
 * Evita race condition donde fecha y hora provienen de instantes distintos
 * @returns {{ fecha: string, hora: string }} Fecha y hora sincronizadas
 */
const generarTimestampEmision = () => {
    const ahora = new Date();
    return {
        fecha: ahora.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
        hora: ahora.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false }),
    };
};

/**
 * Genera un sello de tiempo en formato ISO 8601
 * @returns {string} Fecha y hora actual en formato ISO
 */
const generarFechaEmision = () => {
    return new Date().toISOString();
};

/**
 * Formatea una fecha a YYYY-MM-DD (zona horaria El Salvador)
 * @param {Date|string} fecha - Fecha a formatear
 * @returns {string} Fecha formateada
 */
const formatearFecha = (fecha) => {
    if (!(fecha instanceof Date)) {
        fecha = new Date(fecha);
    }
    return fecha.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
};

module.exports = {
    TIMEZONE,
    generarFechaActual,
    generarHoraEmision,
    generarTimestampEmision,
    generarFechaEmision,
    formatearFecha,
};
