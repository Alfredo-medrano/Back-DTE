/**
 * ========================================
 * BUILDER: FACTURA ELECTRÓNICA (DTE-01)
 * Módulo: DTE
 * ========================================
 * Construye documento FE según Anexo II MH
 */

const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');
const { obtenerConfigDTE } = require('../constants');

/**
 * Construye un documento Factura Electrónica completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1 }) => {
    const tipoDte = '01';
    const configDte = obtenerConfigDTE(tipoDte);

    // Identificadores
    const codigoGeneracion = generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
    const fechaEmision = generarFechaActual();
    const horaEmision = generarHoraEmision();

    // NIT para Hacienda (últimos 9 dígitos)
    const nitHacienda = emisor.nit.slice(-9);

    // Procesar items
    const cuerpoDocumento = items.map((item, index) => {
        return calcularLineaProducto(item, index + 1, tipoDte);
    });

    // Calcular resumen
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
            tipoDocumento: receptor.tipoDocumento || '36',
            numDocumento: receptor.numDocumento,
            nrc: null, // FE no requiere NRC del receptor
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: null,
            descActividad: null,
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
    tipoDte: '01',
    nombre: 'Factura Electrónica',
};
