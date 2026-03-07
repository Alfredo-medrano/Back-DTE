/**
 * ========================================
 * BUILDER: CRÉDITO FISCAL (DTE-03)
 * Módulo: DTE
 * ========================================
 * Construye documento CCF según Anexo II MH
 * DIFERENCIA CON FE: IVA separado, receptor con NRC
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Crédito Fiscal completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1 }) => {
    const tipoDte = '03';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor, tipoDte);
    const cuerpoDocumento = procesarItems(items, tipoDte);
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        receptor: {
            // CCF REQUIERE NIT y NRC del receptor de forma directa (sin tipoDocumento)
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
        resumen: {
            totalNoSuj: resumen.totalNoSuj,
            totalExenta: resumen.totalExenta,
            totalGravada: resumen.totalGravada,
            subTotalVentas: resumen.subTotalVentas,
            descuNoSuj: resumen.descuNoSuj,
            descuExenta: resumen.descuExenta,
            descuGravada: resumen.descuGravada,
            porcentajeDescuento: resumen.porcentajeDescuento,
            totalDescu: resumen.totalDescu,
            tributos: resumen.tributos,
            subTotal: resumen.subTotal,
            ivaPerci1: 0.00, // CAMPO REQUERIDO DTE-03
            ivaRete1: resumen.ivaRete1,
            reteRenta: resumen.reteRenta,
            montoTotalOperacion: resumen.montoTotalOperacion,
            totalNoGravado: resumen.totalNoGravado,
            totalPagar: resumen.totalPagar,
            totalLetras: resumen.totalLetras,
            saldoFavor: resumen.saldoFavor,
            condicionOperacion: resumen.condicionOperacion,
            pagos: resumen.pagos,
            numPagoElectronico: resumen.numPagoElectronico,
            // NOTA: totalIva NO va en DTE-03
        },
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '03',
    nombre: 'Crédito Fiscal',
};
