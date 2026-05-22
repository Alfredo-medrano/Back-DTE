/**
 * ========================================
 * BUILDER: CRÉDITO FISCAL (DTE-03)
 * Módulo: DTE
 * ========================================
 * Construye documento CCF según Anexo II MH
 *
 * REGLAS CRÍTICAS DTE-03:
 * - precioUni SIN IVA (precio base neto)
 * - cuerpoDocumento lleva tributos: ["20"], NO lleva ivaItem
 * - resumen lleva ivaPerci1, NO lleva totalIva
 * - receptor OBLIGATORIO con NIT + NRC
 * - pagos es SIEMPRE un array (nunca null)
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Crédito Fiscal completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, datosPago = {} }) => {
    const tipoDte = '03';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor, tipoDte);
    const cuerpoDocumento = procesarItems(items, tipoDte);

    // El calculador ya retorna el resumen correcto para CCF-03
    // (con ivaPerci1, sin totalIva, con pagos como array)
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte, datosPago);

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        receptor: {
            // CCF REQUIERE NIT y NRC del receptor directamente (sin tipoDocumento)
            nit: receptor.nit || receptor.numDocumento, // OBLIGATORIO en DTE-03
            nrc: receptor.nrc, // OBLIGATORIO
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad,
            descActividad: (receptor.descActividad || '').toUpperCase(),
            nombreComercial: receptor.nombreComercial?.toUpperCase() || null,
            direccion: receptor.direccion ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: (receptor.direccion.complemento || '').toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo,
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
    tipoDte: '03',
    nombre: 'Crédito Fiscal',
};
