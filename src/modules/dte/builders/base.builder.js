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
 * @param {string} tipoDte - Tipo de DTE (01, 03, 05, 06, 14...)
 * @returns {object} Bloque emisor según Anexo II
 *
 * CCF (03): REQUIERE codEstableMH, codEstable, codPuntoVentaMH, codPuntoVenta
 * NC (05) / ND (06): PROHÍBE esos campos (additionalProperties: false)
 */
const construirEmisor = (emisor, tipoDte = '01') => {
    // NIT para Hacienda: acepta 9 o 14 dígitos
    const nitHacienda = emisor.nit.slice(-9);

    const base = {
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
    };

    // FSE (14) prohíbe nombreComercial y tipoEstablecimiento en el emisor
    if (tipoDte === '14') {
        delete base.nombreComercial;
        delete base.tipoEstablecimiento;
    }

    // codEstableMH y codPuntoVentaMH: requeridos en CCF-03 y FSE-14, prohibidos en NC-05 y ND-06
    if (tipoDte === '03' || tipoDte === '14') {
        // MH exige exactamente 4 chars para los códigos MH
        const codMH = (emisor.codEstableMH || 'M001').padStart(4, '0').slice(-4);
        const codPVMH = (emisor.codPuntoVentaMH || 'P001').padStart(4, '0').slice(-4);
        base.codEstableMH = codMH;
        base.codEstable = emisor.codEstableMH || null;
        base.codPuntoVentaMH = codPVMH;
        base.codPuntoVenta = emisor.codPuntoVentaMH || null;
    }

    return base;
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
