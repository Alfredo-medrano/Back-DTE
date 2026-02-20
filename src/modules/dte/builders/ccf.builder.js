/**
 * ========================================
 * BUILDER: CRÉDITO FISCAL (DTE-03)
 * Módulo: DTE
 * ========================================
 * Construye documento CCF según Anexo II MH
 * DIFERENCIA CON FE: IVA separado, receptor con NRC
 */

const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');
const { obtenerConfigDTE } = require('../constants');

/**
 * Construye un documento Crédito Fiscal completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1 }) => {
    const tipoDte = '03';
    const configDte = obtenerConfigDTE(tipoDte);

    // Identificadores
    const codigoGeneracion = generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
    const fechaEmision = generarFechaActual();
    const horaEmision = generarHoraEmision();

    // NIT para Hacienda (últimos 9 dígitos)
    const nitHacienda = emisor.nit.slice(-9);

    // Procesar items (CCF: IVA separado)
    const cuerpoDocumento = items.map((item, index) => {
        return calcularLineaProducto(item, index + 1, tipoDte);
    });

    // Calcular resumen (CCF suma IVA al final)
    const resumen = calcularResumenFactura(cuerpoDocumento, condicionOperacion, tipoDte);

    // Construir documento completo
    return {
        identificacion: {
            version: configDte.version,
            ambiente: emisor.ambiente || '00',
            tipoDte,
            numeroControl,
            codigoGeneracion,
            tipoModelo: 1,
            tipoOperacion: 1,
            tipoContingencia: null,
            motivoContin: null,
            fecEmi: fechaEmision,
            horEmi: horaEmision,
            tipoMoneda: 'USD',
        },
        documentoRelacionado: null,
        emisor: {
            nit: nitHacienda,
            nrc: emisor.nrc,
            nombre: (emisor.nombre || '').toUpperCase(),
            codActividad: emisor.codActividad,
            descActividad: (emisor.descActividad || '').toUpperCase(),
            nombreComercial: emisor.nombreComercial?.toUpperCase() || null,
            tipoEstablecimiento: emisor.tipoEstablecimiento || '01',
            direccion: {
                departamento: emisor.departamento || '06',
                municipio: emisor.municipio || '14',
                complemento: (emisor.complemento || '').toUpperCase(),
            },
            telefono: emisor.telefono,
            correo: emisor.correo,
            codEstableMH: emisor.codEstableMH || 'M001',
            codEstable: emisor.codEstableMH || 'M001',
            codPuntoVentaMH: emisor.codPuntoVentaMH || 'P001',
            codPuntoVenta: emisor.codPuntoVentaMH || 'P001',
        },
        receptor: {
            // CCF REQUIERE NIT y NRC del receptor de forma directa (sin tipoDocumento)
            nit: receptor.nit, // OBLIGATORIO en DTE-03
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
