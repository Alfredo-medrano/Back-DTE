/**
 * ========================================
 * SERVICIO ORQUESTADOR DTE
 * Módulo: DTE
 * ========================================
 * Orquesta el flujo completo de facturación:
 * 1. Validar datos
 * 2. Construir documento DTE
 * 3. Firmar con Docker
 * 4. Enviar a Hacienda
 */

const config = require('../../../config/env');
const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { obtenerConfigDTE } = require('../constants');
const { calcularLineaProducto, calcularResumenFactura, validarCuadre } = require('./dte-calculator.service');
const signerService = require('./signer.service');
const mhService = require('./mh-sender.service');

/**
 * Procesa una factura electrónica completa
 * @param {object} datos - Datos de la factura
 * @returns {Promise<object>} Resultado del procesamiento
 */
const procesarFactura = async (datos) => {
    const {
        emisor,
        receptor,
        items,
        tipoDte = '01',
        correlativo = 1,
        condicionOperacion = 1,
    } = datos;

    // Generar identificadores
    const codigoGeneracion = generarCodigoGeneracion();
    const codEstableMH = emisor.codEstableMH || 'M001';
    const codPuntoVentaMH = emisor.codPuntoVentaMH || 'P001';
    const codigoEstablecimiento = codEstableMH + codPuntoVentaMH;
    const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
    const fechaEmision = generarFechaActual();
    const horaEmision = generarHoraEmision();

    // Preparar NITs
    const nitDocker = emisor.nit.padStart(14, '0');
    const nitHacienda = nitDocker.slice(-9);

    // Procesar cuerpo del documento
    const cuerpoDocumento = items.map((item, index) => {
        return calcularLineaProducto(item, index + 1, tipoDte);
    });

    // Calcular resumen
    const resumen = calcularResumenFactura(cuerpoDocumento, condicionOperacion, tipoDte);
    const validacion = validarCuadre(resumen);
    if (!validacion.valido) {
        console.warn('⚠️ Advertencia:', validacion.mensaje);
    }

    // Obtener configuración del tipo DTE
    const configDte = obtenerConfigDTE(tipoDte);
    const versionDte = configDte ? configDte.version : 1;

    // Construir documento DTE
    const documentoDTE = construirDocumentoDTE({
        identificacion: {
            version: versionDte,
            ambiente: config.emisor.ambiente,
            tipoDte,
            numeroControl,
            codigoGeneracion,
            fechaEmision,
            horaEmision,
        },
        emisor: { ...emisor, nit: nitHacienda },
        receptor,
        cuerpoDocumento,
        resumen,
    });

    console.log('✅ Documento DTE construido según Anexo II');

    // Firmar documento
    console.log('🔏 Enviando a firmar...');
    const resultadoFirma = await signerService.firmarDocumento(
        documentoDTE,
        nitDocker,
        config.mh.clavePrivada
    );

    if (!resultadoFirma.exito) {
        return {
            exito: false,
            error: 'Error al firmar documento',
            detalle: resultadoFirma.error,
            documento: documentoDTE,
        };
    }

    // Enviar a Hacienda
    console.log('📤 Transmitiendo a Hacienda...');
    const resultadoMH = await mhService.enviarDTE(
        resultadoFirma.firma,
        config.emisor.ambiente,
        tipoDte,
        versionDte,
        codigoGeneracion
    );

    return {
        exito: resultadoMH.exito,
        datos: resultadoMH.exito ? {
            codigoGeneracion,
            numeroControl,
            selloRecibido: resultadoMH.selloRecibido,
            fechaProcesamiento: resultadoMH.fechaProcesamiento,
            estado: resultadoMH.estado,
        } : null,
        error: resultadoMH.exito ? null : resultadoMH.error,
        observaciones: resultadoMH.observaciones,
        documento: documentoDTE,
        documentoFirmado: resultadoFirma.firma,
    };
};

/**
 * Construye el documento DTE estructura Anexo II
 */
const construirDocumentoDTE = ({ identificacion, emisor, receptor, cuerpoDocumento, resumen }) => {
    return {
        identificacion: {
            version: identificacion.version,
            ambiente: identificacion.ambiente,
            tipoDte: identificacion.tipoDte,
            numeroControl: identificacion.numeroControl,
            codigoGeneracion: identificacion.codigoGeneracion,
            tipoModelo: 1,
            tipoOperacion: 1,
            tipoContingencia: null,
            motivoContin: null,
            fecEmi: identificacion.fechaEmision,
            horEmi: identificacion.horaEmision,
            tipoMoneda: 'USD',
        },
        documentoRelacionado: null,
        emisor: {
            nit: emisor.nit,
            nrc: emisor.nrc,
            nombre: (emisor.nombre || '').toUpperCase(),
            codActividad: emisor.codActividad,
            descActividad: (emisor.descActividad || '').toUpperCase(),
            nombreComercial: emisor.nombreComercial?.toUpperCase() || null,
            tipoEstablecimiento: emisor.tipoEstablecimiento || '01',
            direccion: {
                departamento: emisor.direccion?.departamento || '06',
                municipio: emisor.direccion?.municipio || '14',
                complemento: (emisor.direccion?.complemento || '').toUpperCase(),
            },
            telefono: emisor.telefono,
            correo: emisor.correo,
            codEstableMH: emisor.codEstableMH || 'M001',
            codEstable: emisor.codEstable || 'M001',
            codPuntoVentaMH: emisor.codPuntoVentaMH || 'P001',
            codPuntoVenta: emisor.codPuntoVenta || 'P001',
        },
        receptor: {
            tipoDocumento: receptor.tipoDocumento || '36',
            numDocumento: receptor.numDocumento,
            nrc: receptor.nrc || null,
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || null,
            descActividad: receptor.descActividad?.toUpperCase() || null,
            direccion: {
                departamento: receptor.direccion?.departamento || '06',
                municipio: receptor.direccion?.municipio || '14',
                complemento: (receptor.direccion?.complemento || '').toUpperCase(),
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

/**
 * Transmite un documento DTE ya construido
 */
const transmitirDirecto = async (documentoDTE) => {
    const tipoDte = documentoDTE.identificacion.tipoDte || '01';
    const codigoGeneracion = documentoDTE.identificacion.codigoGeneracion;
    const version = documentoDTE.identificacion.version || 1;

    const resultadoFirma = await signerService.firmarDocumento(
        documentoDTE,
        documentoDTE.emisor.nit,
        config.mh.clavePrivada
    );

    if (!resultadoFirma.exito) {
        return { exito: false, error: resultadoFirma.error };
    }

    const resultadoMH = await mhService.enviarDTE(
        resultadoFirma.firma,
        documentoDTE.identificacion.ambiente || config.emisor.ambiente,
        tipoDte,
        version,
        codigoGeneracion
    );

    return { ...resultadoMH, documentoFirmado: resultadoFirma.firma };
};

module.exports = {
    procesarFactura,
    construirDocumentoDTE,
    transmitirDirecto,
};
