/**
 * ========================================
 * CONFIGURACIÓN DE TIPOS DTE
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Mapeo centralizado de tipos de DTE con sus versiones
 * y características según esquemas oficiales del MH.
 * 
 * VERSIONES SEGÚN ESQUEMAS OFICIALES:
 * - FE (01): v1 - fe-fc-v1.json
 * - CCF (03): v3 - fe-ccf-v3.json
 * - NR (04): v1 - fe-nr-v1.json
 * - NC (05): v3 - fe-nc-v3.json
 * - ND (06): v3 - fe-nd-v3.json
 * - CR (07): v1 - Contingencia
 * - FEX (11): v1 - fe-fex-v1.json
 * - FSE (14): v1 - fe-fse-v1.json
 * - CD (15): v1 - fe-cd-v1.json
 */

/**
 * Configuración de todos los tipos de DTE soportados
 */
const TIPOS_DTE = {
    // ========================================
    // FACTURA ELECTRÓNICA (FE) - Consumidor Final
    // ========================================
    '01': {
        version: 1,
        codigo: '01',
        nombre: 'Factura Electrónica',
        nombreCorto: 'FE',
        schemaFile: 'fe-fc-v1.json',
        precioIncluyeIVA: true,      // Precio al consumidor YA incluye IVA
        usaTributos: false,           // tributos = null en cuerpoDocumento
        usaReceptor: true,            // Usa sección "receptor"
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,   // NRC receptor opcional
        requiereDocRelacionado: false,
        obligatorio: true,            // Prueba obligatoria (*)
    },

    // ========================================
    // COMPROBANTE DE CRÉDITO FISCAL (CCF)
    // ========================================
    '03': {
        version: 3,                   // IMPORTANTE: v3, no v1
        codigo: '03',
        nombre: 'Comprobante de Crédito Fiscal',
        nombreCorto: 'CCF',
        schemaFile: 'fe-ccf-v3.json',
        precioIncluyeIVA: false,      // Precio NETO (sin IVA)
        usaTributos: true,            // tributos = ["20"] en cuerpoDocumento
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: true,    // NRC receptor OBLIGATORIO
        requiereDocRelacionado: false,
        obligatorio: true,            // Prueba obligatoria (*)
        codigoTributoIVA: '20',       // Código IVA para array tributos
    },

    // ========================================
    // NOTA DE REMISIÓN
    // ========================================
    '04': {
        version: 1,
        codigo: '04',
        nombre: 'Nota de Remisión',
        nombreCorto: 'NR',
        schemaFile: 'fe-nr-v1.json',
        precioIncluyeIVA: false,
        usaTributos: false,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
    },

    // ========================================
    // NOTA DE CRÉDITO
    // ========================================
    '05': {
        version: 3,                   // IMPORTANTE: v3
        codigo: '05',
        nombre: 'Nota de Crédito',
        nombreCorto: 'NC',
        schemaFile: 'fe-nc-v3.json',
        precioIncluyeIVA: false,
        usaTributos: true,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: true,
        requiereDocRelacionado: true,  // DEBE referenciar documento original
        obligatorio: true,             // Prueba obligatoria (*)
        codigoTributoIVA: '20',
    },

    // ========================================
    // NOTA DE DÉBITO
    // ========================================
    '06': {
        version: 3,                    // IMPORTANTE: v3
        codigo: '06',
        nombre: 'Nota de Débito',
        nombreCorto: 'ND',
        schemaFile: 'fe-nd-v3.json',
        precioIncluyeIVA: false,
        usaTributos: true,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: true,
        requiereDocRelacionado: true,
        obligatorio: false,
        codigoTributoIVA: '20',
    },

    // ========================================
    // FACTURA DE EXPORTACIÓN
    // ========================================
    '11': {
        version: 1,
        codigo: '11',
        nombre: 'Factura de Exportación',
        nombreCorto: 'FEX',
        schemaFile: 'fe-fex-v1.json',
        precioIncluyeIVA: false,       // Exportación no lleva IVA
        usaTributos: false,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
        esExportacion: true,           // Requiere campos adicionales
    },

    // ========================================
    // FACTURA DE SUJETO EXCLUIDO
    // ========================================
    '14': {
        version: 1,
        codigo: '14',
        nombre: 'Factura de Sujeto Excluido',
        nombreCorto: 'FSE',
        schemaFile: 'fe-fse-v1.json',
        precioIncluyeIVA: false,
        usaTributos: false,
        usaReceptor: false,            // NO usa receptor
        usaSujetoExcluido: true,       // USA sujetoExcluido
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
        aplicaRetencion: true,         // Retención renta 10%
        tasaRetencion: 0.10,
    },

    // ========================================
    // COMPROBANTE DE DONACIÓN
    // ========================================
    '15': {
        version: 1,
        codigo: '15',
        nombre: 'Comprobante de Donación',
        nombreCorto: 'CD',
        schemaFile: 'fe-cd-v1.json',
        precioIncluyeIVA: false,
        usaTributos: false,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
    },
};

/**
 * Código de tributo IVA según catálogo MH
 */
const CODIGO_IVA = '20';
const DESCRIPCION_IVA = 'Impuesto al Valor Agregado 13%';
const TASA_IVA = 0.13;

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
 * Genera el array de tributos para cuerpoDocumento (CCF, NC, ND)
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
 * Genera el objeto de tributos para resumen (CCF, NC, ND)
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
 * Verifica si un tipo de DTE es obligatorio para certificación
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {boolean} true si es obligatorio
 */
const esObligatorio = (tipoDte) => {
    const config = TIPOS_DTE[tipoDte];
    return config ? config.obligatorio : false;
};

/**
 * Lista los tipos de DTE obligatorios (*)
 * @returns {array} Array con códigos de DTEs obligatorios
 */
const listarObligatorios = () => {
    return Object.keys(TIPOS_DTE).filter(key => TIPOS_DTE[key].obligatorio);
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
    TIPOS_DTE,
    CODIGO_IVA,
    DESCRIPCION_IVA,
    TASA_IVA,
    obtenerConfigDTE,
    obtenerVersionDTE,
    precioIncluyeIVA,
    usaTributos,
    generarTributosCuerpo,
    generarTributosResumen,
    esObligatorio,
    listarObligatorios,
    listarTiposDTE,
};
