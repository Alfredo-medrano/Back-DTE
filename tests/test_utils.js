/**
 * ========================================
 * UTILIDADES DE PRUEBA
 * ========================================
 * Funciones auxiliares para formatear la salida de los tests
 * y manejar aserciones básicas para mantener el código limpio.
 */

const fs = require('fs');
const path = require('path');

// Colores ANSI para consola (Clean Code sin dependencias externas extras como chalk)
const C = {
    RESET: "\x1b[0m",
    BRIGHT: "\x1b[1m",
    DIM: "\x1b[2m",
    RED: "\x1b[31m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    BLUE: "\x1b[34m",
    CYAN: "\x1b[36m",
    WHITE: "\x1b[37m",
};

/**
 * Imprime un encabezado de sección formateado
 * @param {string} titulo - Título de la sección
 */
const printHeader = (titulo) => {
    console.log('\n' + C.BRIGHT + C.CYAN + '='.repeat(60) + C.RESET);
    console.log(C.BRIGHT + C.CYAN + ` ${titulo.toUpperCase()} ` + C.RESET);
    console.log(C.BRIGHT + C.CYAN + '='.repeat(60) + C.RESET + '\n');
};

/**
 * Imprime un mensaje de éxito
 * @param {string} mensaje - Mensaje a mostrar
 */
const printPass = (mensaje) => {
    console.log(`${C.GREEN}✔ PASS:${C.RESET} ${mensaje}`);
};

/**
 * Imprime un mensaje de fallo
 * @param {string} mensaje - Mensaje de error
 * @param {any} error - Objeto de error o detalles (opcional)
 */
const printFail = (mensaje, error = null) => {
    console.log(`${C.RED}✘ FAIL:${C.RESET} ${mensaje}`);
    if (error) {
        if (error.response && error.response.data) {
            console.error(C.DIM + JSON.stringify(error.response.data, null, 2) + C.RESET);
        } else if (error.message) {
            console.error(C.DIM + error.message + C.RESET);
        } else {
            console.error(C.DIM + JSON.stringify(error, null, 2) + C.RESET);
        }
    }
};

/**
 * Imprime información informativa/debug
 * @param {string} label - Etiqueta
 * @param {string} valor - Valor a mostrar
 */
const printInfo = (label, valor) => {
    console.log(`${C.BLUE}ℹ ${label}:${C.RESET} ${valor}`);
};

/**
 * Guarda un objeto JSON en un archivo para inspección
 * @param {string} filename - Nombre del archivo
 * @param {object} data - Datos a guardar
 */
const saveLog = (filename, data) => {
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }
    const filePath = path.join(logDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`${C.DIM}  → Log guardado en: logs/${filename}${C.RESET}`);
};

module.exports = {
    printHeader,
    printPass,
    printFail,
    printInfo,
    saveLog
};
