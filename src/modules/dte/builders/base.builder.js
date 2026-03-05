/**
 * ========================================
 * BUILDER BASE COMÚN
 * Módulo: DTE
 * ========================================
 * Funciones compartidas por todos los builders de DTE.
 * Elimina duplicación de: identificación, emisor, items.
 */

const { generarCodigoGeneracion, generarNumeroControl, generarTimestampEmision } = require('../../../shared/utils');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');
const { obtenerConfigDTE } = require('../constants');

/**
 * Construye el bloque de identificación del DTE
 * Usa un solo timestamp para fecha y hora (sin race condition)
 * @param {string} tipoDte - Tipo de DTE (01, 03, 05, etc.)
 * @param {object} emisor - Datos del emisor
 * @param {number} correlativo - Número correlativo
 * @returns {object} Bloque identificación según Anexo II
 */
const construirIdentificacion = (tipoDte, emisor, correlativo) => {
    const configDte = obtenerConfigDTE(tipoDte);
    const codigoGeneracion = generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
    const { fecha, hora } = generarTimestampEmision();

    return {
        version: configDte.version,
        ambiente: emisor.ambiente || '00',
        tipoDte,
        numeroControl,
        codigoGeneracion,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContin: null,
        fecEmi: fecha,
        horEmi: hora,
        tipoMoneda: 'USD',
    };
};

/**
 * Construye el bloque del emisor del DTE
 * @param {object} emisor - Datos del emisor (con credenciales)
 * @returns {object} Bloque emisor según Anexo II
 */
const construirEmisor = (emisor) => {
    // NIT para Hacienda (últimos 9 dígitos)
    const nitHacienda = emisor.nit.slice(-9);

    return {
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
    };
};

/**
 * Procesa los items y genera el cuerpoDocumento
 * @param {Array} items - Items del request
 * @param {string} tipoDte - Tipo de DTE
 * @returns {Array} cuerpoDocumento formateado
 */
const procesarItems = (items, tipoDte) => {
    return items.map((item, index) => {
        return calcularLineaProducto(item, index + 1, tipoDte);
    });
};

/**
 * Calcula el resumen del documento
 * @param {Array} cuerpoDocumento - Líneas procesadas
 * @param {number} condicionOperacion - 1=Contado, 2=Crédito, 3=Otro
 * @param {string} tipoDte - Tipo de DTE
 * @returns {object} Resumen formateado
 */
const calcularResumen = (cuerpoDocumento, condicionOperacion, tipoDte) => {
    return calcularResumenFactura(cuerpoDocumento, condicionOperacion, tipoDte);
};

module.exports = {
    construirIdentificacion,
    construirEmisor,
    procesarItems,
    calcularResumen,
};
