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
 * 
 * VERSIÓN MULTI-TENANT: Recibe contexto del tenant
 */

const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { obtenerConfigDTE } = require('../constants');
const { calcularLineaProducto, calcularResumenFactura, validarCuadre } = require('./dte-calculator.service');
const signerService = require('./signer.service');
const mhService = require('./mh-sender.service');

/**
 * Procesa una factura electrónica completa (MULTI-TENANT)
 * @param {object} params - Parámetros de procesamiento
 * @param {object} params.datos - Datos de la factura (receptor, items, etc.)
 * @param {object} params.emisor - Datos del emisor desde BD (con credenciales desencriptadas)
 * @param {string} params.tenantId - ID del tenant
 * @returns {Promise<object>} Resultado del procesamiento
 */
const procesarFactura = async ({ datos, emisor, tenantId }) => {
    const {
        receptor,
        items,
        tipoDte = '01',
        correlativo,
        condicionOperacion = 1,
    } = datos;

    // Generar identificadores
    const codigoGeneracion = generarCodigoGeneracion();
    const codigoEstablecimiento = (emisor.codEstableMH || 'M001') + (emisor.codPuntoVentaMH || 'P001');
    const correlativoFinal = correlativo || 1; // En producción se obtiene del emisor
    const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativoFinal);
    const fechaEmision = generarFechaActual();
    const horaEmision = generarHoraEmision();

    // Preparar NIT para Hacienda (últimos 9 dígitos)
    const nitHacienda = emisor.nit.slice(-9);

    console.log(`📄 [Tenant: ${tenantId}] Procesando ${tipoDte} para ${receptor.nombre || 'RECEPTOR'}`);

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
            ambiente: emisor.ambiente,
            tipoDte,
            numeroControl,
            codigoGeneracion,
            fechaEmision,
            horaEmision,
        },
        emisor: formatearEmisor(emisor, nitHacienda),
        receptor,
        cuerpoDocumento,
        resumen,
    });

    console.log('✅ Documento DTE construido según Anexo II');

    // Firmar documento
    console.log('🔏 Enviando a firmar...');
    const resultadoFirma = await signerService.firmarDocumento({
        documento: documentoDTE,
        nit: emisor.nit,
        clavePrivada: emisor.mhClavePrivada,
    });

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
    const resultadoMH = await mhService.enviarDTE({
        documentoFirmado: resultadoFirma.firma,
        ambiente: emisor.ambiente,
        tipoDte,
        version: versionDte,
        codigoGeneracion,
        credenciales: {
            nit: emisor.nit,
            claveApi: emisor.mhClaveApi,
        },
    });

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
        tenantId,
        emisorId: emisor.id,
    };
};

/**
 * Formatea los datos del emisor para el documento DTE
 */
const formatearEmisor = (emisor, nitHacienda) => {
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
        emisor,
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
 * Transmite un documento DTE ya construido (MULTI-TENANT)
 * @param {object} params - Parámetros de transmisión
 * @param {object} params.documentoDTE - Documento DTE completo
 * @param {object} params.emisor - Emisor con credenciales desencriptadas
 */
const transmitirDirecto = async ({ documentoDTE, emisor }) => {
    const tipoDte = documentoDTE.identificacion.tipoDte || '01';
    const codigoGeneracion = documentoDTE.identificacion.codigoGeneracion;
    const version = documentoDTE.identificacion.version || 1;
    const ambiente = documentoDTE.identificacion.ambiente || emisor.ambiente;

    const resultadoFirma = await signerService.firmarDocumento({
        documento: documentoDTE,
        nit: emisor.nit,
        clavePrivada: emisor.mhClavePrivada,
    });

    if (!resultadoFirma.exito) {
        return { exito: false, error: resultadoFirma.error };
    }

    const resultadoMH = await mhService.enviarDTE({
        documentoFirmado: resultadoFirma.firma,
        ambiente,
        tipoDte,
        version,
        codigoGeneracion,
        credenciales: {
            nit: emisor.nit,
            claveApi: emisor.mhClaveApi,
        },
    });

    return { ...resultadoMH, documentoFirmado: resultadoFirma.firma };
};

module.exports = {
    procesarFactura,
    construirDocumentoDTE,
    transmitirDirecto,
    formatearEmisor,
};
