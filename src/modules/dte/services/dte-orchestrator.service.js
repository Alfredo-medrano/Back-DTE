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
const feBuilder = require('../builders/fe.builder');
const ccfBuilder = require('../builders/ccf.builder');

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

    console.log(`📄 [Tenant: ${tenantId}] Procesando ${tipoDte} para ${receptor.nombre || 'RECEPTOR'}`);

    let documentoDTE;

    // Seleccionar builder según tipo de DTE
    try {
        console.log(`🛠️ Construyendo DTE ${tipoDte}...`);
        console.log('Datos recibidos en orchestrator:', JSON.stringify(datos, null, 2));

        if (!items || !Array.isArray(items)) {
            throw new Error(`Los items son requeridos y deben ser un array. Recibido: ${typeof items}`);
        }

        if (tipoDte === '03') {
            documentoDTE = ccfBuilder.construir({
                emisor,
                receptor,
                items,
                correlativo,
                condicionOperacion
            });
        } else {
            // Por defecto FE (01)
            documentoDTE = feBuilder.construir({
                emisor,
                receptor,
                items,
                correlativo,
                condicionOperacion
            });
        }
    } catch (buildError) {
        console.error('❌ Error construyendo documento DTE:', buildError);
        console.error('Stack:', buildError.stack);
        throw buildError;
    }

    const { version, codigoGeneracion, numeroControl } = documentoDTE.identificacion;

    console.log(`✅ Documento DTE construido: ${codigoGeneracion}`);

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
        version,
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
    transmitirDirecto,
};
