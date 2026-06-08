/**
 * ========================================
 * SERVICIO ORQUESTADOR DTE
 * Módulo: DTE
 * ========================================
 * Orquesta el flujo completo de facturación:
 * 1. Construir documento DTE
 * 2. Firmar con Docker
 * 3. Enviar a Hacienda
 * 
 * VERSIÓN MULTI-TENANT: Recibe contexto del tenant
 * PATRÓN OUTBOX: El controller guarda en BD entre cada paso
 */

const signerService = require('./signer.service');
const mhService = require('./mh-sender.service');
const { construirDocumento: buildDTE } = require('../builders');
const { sanitizarParaMH } = require('../builders/sanitize-for-mh');
const logger = require('../../../shared/logger');

/**
 * Construye el documento DTE sin firmar ni enviar.
 * Permite al controller guardarlo en BD antes de los pasos externos.
 * @param {object} params - Parámetros de construcción
 * @returns {object} Documento DTE construido
 */
const construirDocumento = ({ datos, emisor, tenantId }) => {
    const {
        receptor,
        items,
        tipoDte = '01',
        correlativo,
        condicionOperacion = 1,
        documentoRelacionado = null,
        datosExportacion = {},
        observaciones = null,
        datosPago = {},
    } = datos;

    logger.info(`Construyendo DTE ${tipoDte}`, { tenantId, receptor: receptor?.nombre || 'RECEPTOR' });

    if (!items || !Array.isArray(items)) {
        throw new Error(`Los items son requeridos y deben ser un array. Recibido: ${typeof items}`);
    }

    let documentoDTE;

    try {
        documentoDTE = buildDTE(tipoDte, {
            emisor,
            receptor,
            items,
            correlativo,
            condicionOperacion,
            documentoRelacionado,
            datosExportacion,
            observaciones,
            datosPago,
        });
    } catch (buildError) {
        throw new Error(`Builder DTE-${tipoDte}: ${buildError.message}`);
    }

    // CRÍTICO: Sanitizar undefined→eliminado antes de firmar/enviar
    // MH usa additionalProperties:false y rechaza campos inesperados
    documentoDTE = sanitizarParaMH(documentoDTE);

    logger.info('Documento DTE construido y sanitizado', { codigoGeneracion: documentoDTE.identificacion.codigoGeneracion });
    return documentoDTE;
};

/**
 * Firma y envía un documento DTE ya construido.
 * Se ejecuta DESPUÉS de que el controller haya guardado el documento en BD.
 * @param {object} params - Parámetros de envío
 * @returns {Promise<object>} Resultado del procesamiento
 */
const firmarYEnviar = async ({ documentoDTE, emisor, tipoDte }) => {
    const { version, codigoGeneracion, numeroControl } = documentoDTE.identificacion;

    // Paso 1: Firmar
    logger.info('Enviando a firmar');
    const resultadoFirma = await signerService.firmarDocumento({
        documento: documentoDTE,
        nit: emisor.nit,
        clavePrivada: emisor.mhClavePrivada,
    });

    if (!resultadoFirma.exito) {
        return {
            exito: false,
            paso: 'FIRMA',
            error: 'Error al firmar documento',
            detalle: resultadoFirma.error,
            esErrorComunicacion: true,
            mensaje: 'Error al firmar documento',
        };
    }

    // Paso 2: Enviar a Hacienda
    logger.info('Transmitiendo a Hacienda');
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

    const esErrorComunicacion = resultadoMH.mensaje === 'Error de comunicación' || 
                               resultadoMH.mensaje === 'No se pudo obtener token' || 
                               resultadoMH.mensaje === 'Error al autenticar' ||
                               (resultadoMH.error && (
                                   (typeof resultadoMH.error.message === 'string' && resultadoMH.error.message.includes('timeout')) ||
                                   (typeof resultadoMH.error.message === 'string' && resultadoMH.error.message.includes('Network')) ||
                                   resultadoMH.error.code === 'ECONNREFUSED' ||
                                   resultadoMH.error.code === 'ETIMEDOUT'
                               ));

    return {
        exito: resultadoMH.exito,
        paso: resultadoMH.exito ? 'PROCESADO' : 'RECHAZADO',
        datos: resultadoMH.exito ? {
            codigoGeneracion,
            numeroControl,
            selloRecibido: resultadoMH.selloRecibido,
            fechaProcesamiento: resultadoMH.fechaProcesamiento,
            estado: resultadoMH.estado,
        } : null,
        error: resultadoMH.exito ? null : resultadoMH.error,
        observaciones: resultadoMH.observaciones,
        documentoFirmado: resultadoFirma.firma,
        mensaje: resultadoMH.mensaje,
        esErrorComunicacion,
    };
};

/**
 * Flujo completo legacy (usado por transmitirDirecto y scripts)
 * NOTA: Para nuevos flujos usar construirDocumento + firmarYEnviar
 */
const procesarFactura = async ({ datos, emisor, tenantId }) => {
    const documentoDTE = construirDocumento({ datos, emisor, tenantId });
    const tipoDte = datos.tipoDte || '01';

    const resultado = await firmarYEnviar({ documentoDTE, emisor, tipoDte });

    return {
        ...resultado,
        documento: documentoDTE,
        tenantId,
        emisorId: emisor.id,
    };
};

/**
 * Transmisión directa de un documento DTE ya construido
 */
const transmitirDirecto = async ({ documentoDTE, emisor }) => {
    const tipoDte = documentoDTE.identificacion.tipoDte || '01';
    return await firmarYEnviar({ documentoDTE, emisor, tipoDte });
};

/**
 * Reintenta el envío de un DTE fallido ya guardado en BD.
 * Usa el jsonOriginal almacenado para re-firmar y re-enviar.
 * Es llamado por retry-worker.js y retry-queue.service.js.
 *
 * @param {object} params
 * @param {object} params.dte   - Registro DTE traído desde BD (con jsonOriginal)
 * @param {object} params.emisor - Emisor con credenciales desencriptadas
 * @returns {Promise<object>} Resultado del reintento
 */
const reintentarEnvio = async ({ dte, emisor }) => {
    const { jsonOriginal, tipoDte, codigoGeneracion } = dte;

    if (!jsonOriginal) {
        return {
            exito: false,
            paso: 'VALIDACION',
            error: `DTE ${codigoGeneracion} no tiene jsonOriginal guardado`,
        };
    }

    logger.info(`Reintentando envío DTE`, { codigoGeneracion, tipoDte });
    return await firmarYEnviar({
        documentoDTE: jsonOriginal,
        emisor,
        tipoDte: tipoDte || jsonOriginal.identificacion?.tipoDte || '01',
    });
};

/**
 * Crea y firma un DTE bajo contingencia (MH offline)
 */
const procesarContingencia = async ({
    datos,
    emisor,
    tenantId,
    codigoGeneracion = null,
    numeroControl = null,
    fecEmi = null,
    horEmi = null,
}) => {
    // Inject contingency info in emisor object
    const emisorConContingencia = {
        ...emisor,
        contingencia: {
            tipo: 1,
            motivo: 'NO DISPONIBILIDAD DE SISTEMA DEL MH',
            codigoGeneracion,
            numeroControl,
            fecEmi,
            horEmi,
        }
    };

    // Build the contingency DTE
    const documentoContingencia = construirDocumento({
        datos,
        emisor: emisorConContingencia,
        tenantId,
    });

    // Sign it locally (will succeed since Docker firmador is local)
    logger.info('Firmando DTE en modo contingencia', { codigoGeneracion: documentoContingencia.identificacion.codigoGeneracion });
    const resultadoFirma = await signerService.firmarDocumento({
        documento: documentoContingencia,
        nit: emisor.nit,
        clavePrivada: emisor.mhClavePrivada,
    });

    if (!resultadoFirma.exito) {
        throw new Error(`Error al firmar documento en contingencia: ${resultadoFirma.error}`);
    }

    return {
        documentoDTE: documentoContingencia,
        documentoFirmado: resultadoFirma.firma,
        fechaLimiteTransmision: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    };
};

module.exports = {
    construirDocumento,
    firmarYEnviar,
    procesarFactura,
    transmitirDirecto,
    reintentarEnvio,
    procesarContingencia,
};
