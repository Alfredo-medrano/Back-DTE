/**
 * ========================================
 * BUILDER: FACTURA ELECTRÓNICA (DTE-01)
 * Módulo: DTE
 * ========================================
 * Construye documento FE según Anexo II MH
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Factura Electrónica completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1 }) => {
    const tipoDte = '01';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor);
    const cuerpoDocumento = procesarItems(items, tipoDte);
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        receptor: {
            tipoDocumento: receptor.tipoDocumento || null,
            numDocumento: receptor.numDocumento || null,
            nrc: null, // FE no requiere NRC del receptor
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: null,
            descActividad: null,
            direccion: (receptor.direccion && receptor.direccion.complemento && receptor.direccion.complemento.trim().length >= 5) ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: receptor.direccion.complemento.toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo || null,
        },
        otrosDocumentos: null,
        ventaTercero: null,
        cuerpoDocumento,
        resumen,
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '01',
    nombre: 'Factura Electrónica',
};
