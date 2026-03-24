/**
 * ========================================
 * BUILDER: FACTURA DE EXPORTACIÓN (DTE-11)
 * Módulo: DTE
 * ========================================
 * Construye documento FEX según Anexo II MH (schema v1)
 *
 * DIFERENCIAS CLAVE:
 * - Emisor: campos extra de exportación (tipoItemExpor, recintoFiscal, regimen)
 * - Receptor: internacional (codPais, nombrePais, tipoPersona, complemento)
 * - Identificación: usa `motivoContigencia` (typo oficial del MH)
 * - Sin IVA (exportación está exenta/gravada a tasa 0)
 * - Resumen: con seguro, flete, INCOTERMS
 * - cuerpoDocumento: con `noGravado`, sin `ventaNoSuj`/`ventaExenta`
 */

const { construirEmisor, procesarItems } = require('./base.builder');
const { generarCodigoGeneracion, generarNumeroControl, generarTimestampEmision } = require('../../../shared/utils');
const { obtenerConfigDTE } = require('../constants');
const { redondear, numeroALetras } = require('../services/dte-calculator.service');

/**
 * Construye identificación FEX (usa motivoContigencia en lugar de motivoContin)
 */
const construirIdentificacionFEX = (emisor, correlativo) => {
    const configDte = obtenerConfigDTE('11');
    const codigoGeneracion = generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const numeroControl = generarNumeroControl('11', codigoEstablecimiento, correlativo);
    const { fecha, hora } = generarTimestampEmision();

    return {
        version: configDte.version,
        ambiente: emisor.ambiente || '00',
        tipoDte: '11',
        numeroControl,
        codigoGeneracion,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContigencia: null, // Typo oficial del MH (NO es motivoContin)
        fecEmi: fecha,
        horEmi: hora,
        tipoMoneda: 'USD',
    };
};

/**
 * Construye emisor FEX con campos de exportación
 */
const construirEmisorFEX = (emisor, datosExportacion = {}) => {
    const base = construirEmisor(emisor, '11');

    // Campos exclusivos de FEX
    base.tipoItemExpor = datosExportacion.tipoItemExpor || 1; // 1=Bienes, 2=Servicios, 3=Ambos
    base.recintoFiscal = datosExportacion.recintoFiscal || null;
    base.regimen = datosExportacion.regimen || null;

    // Si tipoItemExpor === 2 (servicios), recintoFiscal y regimen deben ser null
    if (base.tipoItemExpor === 2) {
        base.recintoFiscal = null;
        base.regimen = null;
    }

    return base;
};

/**
 * Procesa items de exportación (estructura diferente: con noGravado, sin ventaNoSuj/ventaExenta)
 */
const procesarItemsFEX = (items) => {
    return items.map((item, index) => {
        const cantidad = parseFloat(item.cantidad);
        const precioUnitario = parseFloat(item.precioUnitario || item.precioUni);
        const descuento = parseFloat(item.descuento || item.montoDescu || 0);
        const ventaGravada = redondear(cantidad * precioUnitario - descuento);

        return {
            numItem: index + 1,
            cantidad: redondear(cantidad, 8),
            codigo: item.codigo || null,
            uniMedida: item.uniMedida || item.unidadMedida || 59,
            descripcion: (item.descripcion || '').toUpperCase(),
            precioUni: redondear(precioUnitario),
            montoDescu: redondear(descuento),
            ventaGravada,
            tributos: ['C3'], // FEX usa tributo C3 (Fomento de Exportaciones)
            noGravado: parseFloat(item.noGravado || 0),
        };
    });
};

/**
 * Calcula resumen FEX (campos de exportación)
 */
const calcularResumenFEX = (cuerpoDocumento, condicionOperacion = 1, datosExportacion = {}) => {
    let totalGravada = 0;
    let totalDescuento = 0;
    let totalNoGravado = 0;

    cuerpoDocumento.forEach(linea => {
        totalGravada += linea.ventaGravada || 0;
        totalDescuento += linea.montoDescu || 0;
        totalNoGravado += linea.noGravado || 0;
    });

    totalGravada = redondear(totalGravada);
    totalDescuento = redondear(totalDescuento);
    totalNoGravado = redondear(totalNoGravado);

    const seguro = redondear(parseFloat(datosExportacion.seguro || 0));
    const flete = redondear(parseFloat(datosExportacion.flete || 0));

    const montoTotalOperacion = redondear(totalGravada + seguro + flete);
    const totalPagar = redondear(montoTotalOperacion + totalNoGravado);

    return {
        totalGravada,
        descuento: totalDescuento,
        porcentajeDescuento: 0.00,
        totalDescu: totalDescuento,
        seguro: seguro || null,
        flete: flete || null,
        montoTotalOperacion,
        totalNoGravado,
        totalPagar,
        totalLetras: numeroALetras(totalPagar),
        condicionOperacion,
        pagos: null,
        codIncoterms: datosExportacion.codIncoterms || null,
        descIncoterms: datosExportacion.descIncoterms || null,
        numPagoElectronico: null,
        observaciones: datosExportacion.observaciones || null,
    };
};

/**
 * Construye un documento Factura de Exportación completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, datosExportacion = {} }) => {
    const identificacion = construirIdentificacionFEX(emisor, correlativo);
    const emisorDTE = construirEmisorFEX(emisor, datosExportacion);
    const cuerpoDocumento = procesarItemsFEX(items);
    const resumen = calcularResumenFEX(cuerpoDocumento, condicionOperacion, datosExportacion);

    return {
        identificacion,
        emisor: emisorDTE,
        receptor: receptor ? {
            nombre: (receptor.nombre || '').toUpperCase(),
            codPais: receptor.codPais || '9320',
            nombrePais: (receptor.nombrePais || 'ESTADOS UNIDOS').toUpperCase(),
            complemento: (receptor.complemento || receptor.direccion?.complemento || '').toUpperCase(),
            tipoDocumento: receptor.tipoDocumento || '36',
            numDocumento: receptor.numDocumento || '',
            nombreComercial: receptor.nombreComercial?.toUpperCase() || null,
            tipoPersona: receptor.tipoPersona || 1, // 1=Jurídica, 2=Natural
            descActividad: (receptor.descActividad || '').toUpperCase(),
            telefono: receptor.telefono || null,
            correo: receptor.correo || null,
        } : null,
        otrosDocumentos: null,
        ventaTercero: null,
        cuerpoDocumento,
        resumen,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '11',
    nombre: 'Factura de Exportación',
};
