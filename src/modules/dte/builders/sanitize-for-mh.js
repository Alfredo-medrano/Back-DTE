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
 * Llaves que el MH exige que viajen en el JSON incluso si son null o ""
 * cuando aplican a ciertos DTEs (ej. documentoRelacionado, contingencia, etc.)
 */
const PRESERVE_NULL_EMPTY_KEYS = new Set([
    'tipoContingencia',
    'motivoContin',
    'motivoContigencia',
    'documentoRelacionado',
    'extension',
    'apendice',
    'ventaTercero',
    'otrosDocumentos',
    'tributos',
    'nrc',
    'codActividad',
    'descActividad',
    'telefono',
    'correo',
    'nombreComercial',
    'bienTitulo',
    'codIncoterms',
    'descIncoterms',
    'observaciones',
    'seguro',
    'flete',
    'numPagoElectronico',
    'codigo',
    'codTributo',
    'receptor',
    'sujetoExcluido',
    'numeroDocumento',
    'referencia',
    'plazo',
    'periodo'
]);

/**
 * Sanitiza recursivamente un objeto DTE para envío al MH.
 * - Elimina keys cuyo valor sea `undefined`, `null` o `""` (string vacío)
 * - Preserva `null` / `""` SÓLO para llaves explícitamente listadas en PRESERVE_NULL_EMPTY_KEYS
 * - Recorre objetos anidados y arrays
 *
 * @param {object|array} obj - Objeto o array a sanitizar
 * @returns {object|array} Objeto limpio
 */
const sanitizarParaMH = (obj) => {
    if (obj === null || obj === undefined || obj === '') {
        return null;
    }

    if (Array.isArray(obj)) {
        // Limpiamos los elementos nulos del array resultante
        return obj
            .map(item => sanitizarParaMH(item))
            .filter(item => item !== null && item !== undefined && item !== '');
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    // Date objects → convertir a ISO string
    if (obj instanceof Date) {
        return obj.toISOString();
    }

    const resultado = {};

    for (const [key, value] of Object.entries(obj)) {
        // Si el valor es null, undefined o string vacío, verificamos si es una llave reservada
        if (value === undefined || value === null || value === '') {
            if (PRESERVE_NULL_EMPTY_KEYS.has(key)) {
                resultado[key] = value === undefined ? null : value;
            }
            continue;
        }

        // Recursión para objetos y arrays
        if (typeof value === 'object' && !(value instanceof Date)) {
            const sanitizedValue = sanitizarParaMH(value);
            
            // Omitir objetos vacíos {} o arrays vacíos []
            if (sanitizedValue !== null && sanitizedValue !== undefined) {
                const isEmptyObject = typeof sanitizedValue === 'object' && !Array.isArray(sanitizedValue) && Object.keys(sanitizedValue).length === 0;
                const isEmptyArray = Array.isArray(sanitizedValue) && sanitizedValue.length === 0;
                
                if (!isEmptyObject && !isEmptyArray) {
                    resultado[key] = sanitizedValue;
                } else if (PRESERVE_NULL_EMPTY_KEYS.has(key)) {
                    resultado[key] = null; // O fallback a null si es obligatorio
                }
            }
        } else {
            resultado[key] = value;
        }
    }

    return resultado;
};

module.exports = {
    sanitizarParaMH,
};
