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
 * Formatea el documento del receptor según exigencias del MH
 * DUI: 00000000-0
 * NIT: 0000-000000-000-0
 * @param {string} tipoDocumento - 13 (DUI), 36 (NIT)
 * @param {string} valorRaw - Valor original del documento
 * @returns {string} Valor formateado o el original si no aplica
 */
const formatDocumentoReceptor = (tipoDocumento, valorRaw) => {
    if (!valorRaw) return null;
    
    // Convertir a string para evitar problemas con números e inputs
    const valorStr = String(valorRaw);
    const tipo = String(tipoDocumento);

    // Limpiar: extraer solo los dígitos
    const cleanValue = valorStr.replace(/[^0-9]/g, '');

    if (tipo === "13") { // DUI
        if (cleanValue.length === 9) {
            // Formato DUI: 00000000-0 (EXIGE guion según schema ^[0-9]{8}-[0-9]{1}$)
            return `${cleanValue.substring(0, 8)}-${cleanValue.substring(8)}`;
        }
        // DUI incompleto: devolver dígitos con guion si hay al menos 9
        if (cleanValue.length >= 9) {
            return `${cleanValue.substring(0, 8)}-${cleanValue.substring(8, 9)}`;
        }
    } else if (tipo === "36") { // NIT
        // El schema exige estrictamente ^([0-9]{14}|[0-9]{9})$ para tipo 36
        // SIEMPRE retornar solo dígitos limpios — nunca guiones
        return cleanValue;
    }
    
    // Para otros tipos de documento (02, 03, 37), retornar valor limpio sin caracteres extra
    // pero preservar letras (ej: pasaporte)
    return valorStr.replace(/^\s+|\s+$/g, '');
};

/**
 * Limpia el NRC eliminando guiones y espacios
 * @param {string} valorRaw - Valor original del NRC
 * @returns {string|null} NRC limpio (ej. 1234567)
 */
const cleanNrc = (valorRaw) => {
    if (!valorRaw) return null;
    const limpio = String(valorRaw).replace(/[-\s]/g, '');
    return limpio || null;
};

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
    const codigoGeneracion = emisor.contingencia?.codigoGeneracion || generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const numeroControl = emisor.contingencia?.numeroControl || generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
    
    const { fecha: currentFecha, hora: currentHora } = generarTimestampEmision();
    const fecha = emisor.contingencia?.fecEmi || currentFecha;
    const hora = emisor.contingencia?.horEmi || currentHora;

    const tipoContingenciaRaw = emisor.contingencia?.tipo;
    const tipoContingencia = tipoContingenciaRaw ? parseInt(tipoContingenciaRaw, 10) : null;
    const motivoContin = emisor.contingencia?.motivo || null;
    const tipoOperacion = tipoContingencia ? 2 : 1;
    const tipoModelo = tipoContingencia ? 2 : 1;

    return {
        version: configDte.version,
        ambiente: emisor.ambiente || '00',
        tipoDte,
        numeroControl,
        codigoGeneracion,
        tipoModelo,
        tipoOperacion,
        tipoContingencia,
        motivoContin,
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
    // NIT: Preservar formato original (14 dígitos) como lo requiere el MH
    const nitHacienda = emisor.nit;

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

    // codEstableMH y codPuntoVentaMH: requeridos en la mayoría (01, 03, 04, 11, 14), prohibidos en NC-05 y ND-06
    if (!['05', '06'].includes(tipoDte)) {
        // MH exige exactamente 4 chars para los códigos MH
        const codMH = (emisor.codEstableMH || 'M001').padStart(4, '0').slice(-4);
        const codPVMH = (emisor.codPuntoVentaMH || 'P001').padStart(4, '0').slice(-4);
        base.codEstableMH = codMH;
        base.codEstable = emisor.codEstable || emisor.codEstableMH || codMH;
        base.codPuntoVentaMH = codPVMH;
        base.codPuntoVenta = emisor.codPuntoVenta || emisor.codPuntoVentaMH || codPVMH;
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
 * @param {object} [datosPago] - Datos de pago {codigo, referencia, plazo, periodo}
 * @returns {object} Resumen formateado
 */
const calcularResumen = (cuerpoDocumento, condicionOperacion, tipoDte, datosPago = {}) => {
    return calcularResumenFactura(cuerpoDocumento, condicionOperacion, tipoDte, datosPago);
};

module.exports = {
    construirIdentificacion,
    construirEmisor,
    procesarItems,
    calcularResumen,
    formatDocumentoReceptor,
    cleanNrc,
};
