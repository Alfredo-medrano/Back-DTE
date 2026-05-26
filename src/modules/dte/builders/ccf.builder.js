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

const {
    construirIdentificacion,
    construirEmisor,
    procesarItems,
    calcularResumen,
    cleanNrc,
} = require('./base.builder');
const { getFiscalLogic } = require('../constants');

/**
 * Construye un documento Crédito Fiscal completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, datosPago = {} }) => {
    const tipoDte = '03';
    const logic = getFiscalLogic(tipoDte);

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor, tipoDte);
    const cuerpoDocumento = procesarItems(items, tipoDte);

    // El calculador ya retorna el resumen correcto para CCF-03
    // (con ivaPerci1, sin totalIva, con pagos como array)
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte, datosPago);

    if (!receptor || !receptor.nrc || !(receptor.nit || receptor.numDocumento)) {
        throw new Error('DTE-03 (CCF): El receptor debe tener obligatoriamente NIT y NRC.');
    }

    if (!receptor.correo) {
        throw new Error('DTE-03 (CCF): El receptor requiere correo electrónico obligatorio.');
    }

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        receptor: {
            // CCF receptor: schema fe-ccf-v3.json
            // Campos required: nit, nrc, nombre, codActividad, descActividad,
            //   nombreComercial, direccion, telefono, correo
            // nit: pattern ^([0-9]{14}|[0-9]{9})$
            // nrc: pattern ^[0-9]{1,8}$
            nit: receptor.nit || receptor.numDocumento,
            nrc: cleanNrc(receptor.nrc),
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || '10005',
            descActividad: (receptor.descActividad || 'OTROS').toUpperCase(),
            nombreComercial: receptor.nombreComercial?.toUpperCase() || null,
            direccion: {
                departamento: receptor.direccion?.departamento || '06',
                municipio: receptor.direccion?.municipio || '14',
                complemento: (receptor.direccion?.complemento || 'SIN DIRECCION').toUpperCase(),
            },
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
