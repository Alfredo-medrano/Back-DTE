/**
 * ========================================
 * SANITIZADOR DE JSON PARA MH
 * Módulo: DTE / Builders
 * ========================================
 * El Ministerio de Hacienda (MH) usa `additionalProperties: false`
 * en sus JSON Schemas. Esto significa que:
 * 
 * 1. Un campo `undefined` que JSON.stringify omite PUEDE causar que
 *    falte un campo requerido → RECHAZADO.
 * 2. Un campo extra que Prisma/ORM inyecte (id, createdAt, etc.)
 *    → RECHAZADO inmediatamente.
 * 3. `null` es válido y REQUERIDO en muchos campos (tipoContingencia,
 *    motivoContin, documentoRelacionado, etc.).
 *
 * Esta función se ejecuta como ÚLTIMO PASO antes de firmar.
 */

/**
 * Sanitiza recursivamente un objeto DTE para envío al MH.
 * - Elimina keys cuyo valor sea `undefined`
 * - Preserva `null` (requerido por MH en muchos campos)
 * - Recorre objetos anidados y arrays
 *
 * @param {object|array} obj - Objeto o array a sanitizar
 * @returns {object|array} Objeto limpio sin `undefined`
 */
const sanitizarParaMH = (obj) => {
    if (obj === null || obj === undefined) {
        return null;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizarParaMH(item));
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    // Date objects → convertir a ISO string para evitar serialización inesperada
    if (obj instanceof Date) {
        return obj.toISOString();
    }

    const resultado = {};

    for (const [key, value] of Object.entries(obj)) {
        // REGLA CRÍTICA: Eliminar keys con valor undefined
        // JSON.stringify ya las omite, pero ser explícitos previene bugs
        if (value === undefined) {
            continue;
        }

        // Recursión para objetos anidados
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            resultado[key] = sanitizarParaMH(value);
        } else if (Array.isArray(value)) {
            resultado[key] = value.map(item => sanitizarParaMH(item));
        } else {
            resultado[key] = value;
        }
    }

    return resultado;
};

module.exports = {
    sanitizarParaMH,
};
