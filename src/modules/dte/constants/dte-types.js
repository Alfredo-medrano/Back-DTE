/**
 * ========================================
 * CONSTANTES DE TIPOS DTE
 * Módulo: DTE
 * ========================================
 * Catálogo de tipos de DTE y sus características
 */

/**
 * Configuración de todos los tipos de DTE soportados
 */
const TIPOS_DTE = {
    // FACTURA ELECTRÓNICA (FE) - Consumidor Final
    '01': {
        version: 1,
        codigo: '01',
        nombre: 'Factura Electrónica',
        nombreCorto: 'FE',
        schemaFile: 'fe-fc-v1.json',
        precioIncluyeIVA: true,
        usaTributos: false,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: true,
    },

    // COMPROBANTE DE CRÉDITO FISCAL (CCF)
    '03': {
        version: 3,
        codigo: '03',
        nombre: 'Comprobante de Crédito Fiscal',
        nombreCorto: 'CCF',
        schemaFile: 'fe-ccf-v3.json',
        precioIncluyeIVA: false,
        usaTributos: true,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: true,
        requiereDocRelacionado: false,
        obligatorio: true,
        codigoTributoIVA: '20',
    },

    // NOTA DE REMISIÓN
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

    // NOTA DE CRÉDITO
    '05': {
        version: 3,
        codigo: '05',
        nombre: 'Nota de Crédito',
        nombreCorto: 'NC',
        schemaFile: 'fe-nc-v3.json',
        precioIncluyeIVA: false,
        usaTributos: true,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: true,
        requiereDocRelacionado: true,
        obligatorio: true,
        codigoTributoIVA: '20',
    },

    // NOTA DE DÉBITO
    '06': {
        version: 3,
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

    // FACTURA DE EXPORTACIÓN
    '11': {
        version: 1,
        codigo: '11',
        nombre: 'Factura de Exportación',
        nombreCorto: 'FEX',
        schemaFile: 'fe-fex-v1.json',
        precioIncluyeIVA: false,
        usaTributos: false,
        usaReceptor: true,
        usaSujetoExcluido: false,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
        esExportacion: true,
    },

    // FACTURA DE SUJETO EXCLUIDO
    '14': {
        version: 1,
        codigo: '14',
        nombre: 'Factura de Sujeto Excluido',
        nombreCorto: 'FSE',
        schemaFile: 'fe-fse-v1.json',
        precioIncluyeIVA: false,
        usaTributos: false,
        usaReceptor: false,
        usaSujetoExcluido: true,
        requiereNRCReceptor: false,
        requiereDocRelacionado: false,
        obligatorio: false,
        aplicaRetencion: true,
        tasaRetencion: 0.10,
    },

    // COMPROBANTE DE DONACIÓN
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

// Constantes de IVA
const CODIGO_IVA = '20';
const DESCRIPCION_IVA = 'Impuesto al Valor Agregado 13%';
const TASA_IVA = 0.13;

module.exports = {
    TIPOS_DTE,
    CODIGO_IVA,
    DESCRIPCION_IVA,
    TASA_IVA,
};
