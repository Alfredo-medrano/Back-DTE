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
const { construirDocumento: buildDTE, eventContingencyBuilder } = require('../builders');
const { sanitizarParaMH } = require('../builders/sanitize-for-mh');
const logger = require('../../../shared/logger');
const { prisma } = require('../../../shared/db');
const emailDelivery = require('./email-delivery.service');
const { tenantService } = require('../../iam');

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
        emisorId: emisor.id,
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
            tipo: emisor.contingenciaTipo || 1,
            motivo: emisor.contingenciaMotivo || 'NO DISPONIBILIDAD DE SISTEMA DEL MH',
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
        emisorId: emisor.id,
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

/**
 * Crea, firma y envía un Evento de Contingencia a Hacienda
 */
const procesarEventoContingencia = async ({
    emisor,
    fInicio,
    hInicio,
    fFin,
    hFin,
    tipoContingencia,
    motivoContingencia,
    dtes
}) => {
    // 1. Construir el JSON de contingencia
    const eventJson = eventContingencyBuilder.construir({
        emisor,
        fInicio,
        hInicio,
        fFin,
        hFin,
        tipoContingencia,
        motivoContingencia,
        dtes
    });

    // 2. Firmar con Docker firmador
    logger.info('Firmando Evento de Contingencia', { codigoGeneracion: eventJson.identificacion.codigoGeneracion });
    const resultadoFirma = await signerService.firmarDocumento({
        documento: eventJson,
        nit: emisor.nit,
        clavePrivada: emisor.mhClavePrivada,
        emisorId: emisor.id,
    });

    if (!resultadoFirma.exito) {
        return {
            exito: false,
            error: 'Error al firmar evento de contingencia',
            detalle: resultadoFirma.error,
        };
    }

    // 3. Enviar al MH
    logger.info('Transmitiendo Evento de Contingencia a Hacienda');
    const resultadoMH = await mhService.enviarEventoContingencia({
        documentoFirmado: resultadoFirma.firma,
        ambiente: emisor.ambiente,
        version: eventJson.identificacion.version,
        codigoGeneracion: eventJson.identificacion.codigoGeneracion,
        credenciales: {
            nit: emisor.nit,
            claveApi: emisor.mhClaveApi,
        }
    });

    return {
        exito: resultadoMH.exito,
        selloRecibido: resultadoMH.selloRecibido,
        codigoGeneracion: eventJson.identificacion.codigoGeneracion,
        fechaProcesamiento: resultadoMH.fechaProcesamiento,
        estado: resultadoMH.estado,
        error: resultadoMH.error,
        observaciones: resultadoMH.observaciones || resultadoMH.mensaje,
        documentoFirmado: resultadoFirma.firma,
    };
};

/**
 * Realiza la regularización completa de contingencia para un emisor
 */
const regularizarContingencia = async ({
    emisorId,
    fInicio = null,
    hInicio = null,
    fFin = null,
    hFin = null,
    tipoContingencia = null,
    motivoContingencia = null
}) => {
    // 1. Obtener DTEs en estado CONTINGENCIA para este emisor
    const dtes = await prisma.dte.findMany({
        where: {
            emisorId,
            status: 'CONTINGENCIA',
        },
        orderBy: {
            createdAt: 'asc', // FIFO
        },
    });

    if (dtes.length === 0) {
        return {
            exito: true,
            mensaje: 'No hay documentos en contingencia pendientes de regularización.',
            procesados: 0,
            exitosos: 0,
            fallidos: 0,
        };
    }

    // 2. Obtener emisor con credenciales
    const emisor = await prisma.emisor.findUnique({
        where: { id: emisorId },
    });

    if (!emisor) {
        throw new Error(`Emisor con ID ${emisorId} no encontrado`);
    }

    const emisorConCredenciales = {
        ...emisor,
        mhClaveApi: tenantService.desencriptar(emisor.mhClaveApi),
        mhClavePrivada: tenantService.desencriptar(emisor.mhClavePrivada),
    };

    // 3. Determinar fechas e información del motivo de la contingencia
    const primerDte = dtes[0];
    const ultimoDte = dtes[dtes.length - 1];

    const fInicioFinal = fInicio || primerDte.fechaEmision.toISOString().split('T')[0];
    const hInicioFinal = hInicio || primerDte.horaEmision;
    const fFinFinal = fFin || ultimoDte.fechaEmision.toISOString().split('T')[0];
    const hFinFinal = hFin || ultimoDte.horaEmision;
    const tipoContFinal = tipoContingencia || parseInt(primerDte.tipoContingencia || '1', 10);
    const motivoContFinal = motivoContingencia || primerDte.motivoContin || 'NO DISPONIBILIDAD DE SISTEMA DEL MH';

    logger.info(`Iniciando regularización de contingencia para emisor ${emisor.nit}`, {
        cantidadDTEs: dtes.length,
        periodo: `${fInicioFinal} ${hInicioFinal} -> ${fFinFinal} ${hFinFinal}`,
        tipo: tipoContFinal
    });

    // 4. Crear, firmar y transmitir el Evento de Contingencia
    const eventRes = await procesarEventoContingencia({
        emisor: emisorConCredenciales,
        fInicio: fInicioFinal,
        hInicio: hInicioFinal,
        fFin: fFinFinal,
        hFin: hFinFinal,
        tipoContingencia: tipoContFinal,
        motivoContingencia: motivoContFinal,
        dtes: dtes.map(d => ({ codigoGeneracion: d.codigoGeneracion, tipoDte: d.tipoDte }))
    });

    if (!eventRes.exito) {
        logger.error('Error al registrar el Evento de Contingencia en Hacienda', {
            error: eventRes.error,
            observaciones: eventRes.observaciones
        });
        return {
            exito: false,
            mensaje: 'No se pudo registrar el Evento de Contingencia en Hacienda.',
            detalle: eventRes.observaciones || eventRes.error,
            procesados: dtes.length,
            exitosos: 0,
            fallidos: dtes.length,
        };
    }

    logger.info('Evento de Contingencia aprobado exitosamente por Hacienda. Sello:', {
        sello: eventRes.selloRecibido,
        codigoGeneracion: eventRes.codigoGeneracion
    });

    // 5. Transmitir los DTEs individuales uno por uno (FIFO)
    let exitosos = 0;
    let fallidos = 0;
    const fallas = [];

    for (const dte of dtes) {
        try {
            logger.info(`Transmitiendo DTE en contingencia: ${dte.codigoGeneracion}`);
            const resultado = await mhService.enviarDTE({
                documentoFirmado: dte.jsonFirmado,
                ambiente: dte.ambiente,
                tipoDte: dte.tipoDte,
                version: dte.version,
                codigoGeneracion: dte.codigoGeneracion,
                credenciales: {
                    nit: emisorConCredenciales.nit,
                    claveApi: emisorConCredenciales.mhClaveApi,
                },
            });

            if (resultado.exito) {
                // Parsear fecha de procesamiento de Hacienda
                let fechaProc = new Date();
                if (resultado.fechaProcesamiento) {
                    const match = resultado.fechaProcesamiento.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
                    if (match) {
                        fechaProc = new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}`);
                    } else {
                        fechaProc = new Date(resultado.fechaProcesamiento);
                    }
                }

                // Actualizar estado a PROCESADO
                const dteActualizado = await prisma.dte.update({
                    where: { id: dte.id },
                    data: {
                        status: 'PROCESADO',
                        selloRecibido: resultado.selloRecibido,
                        fechaProcesamiento: fechaProc,
                        errorLog: null,
                        observaciones: `Transmitido y sellado tras contingencia (Evento: ${eventRes.codigoGeneracion}).`,
                    },
                });

                exitosos++;
                logger.info(`DTE ${dte.codigoGeneracion} regularizado exitosamente.`);

                // Enviar correo de notificación
                try {
                    await emailDelivery.enviarCorreoFactura({ dte: dteActualizado, emisor: emisorConCredenciales });
                } catch (mailError) {
                    logger.warn(`Error al enviar correo para DTE ${dte.codigoGeneracion}: ${mailError.message}`);
                }
            } else {
                fallidos++;
                logger.error(`Rechazo en DTE ${dte.codigoGeneracion} al regularizar`, { error: resultado.error });
                
                await prisma.dte.update({
                    where: { id: dte.id },
                    data: {
                        intentos: { increment: 1 },
                        errorLog: JSON.stringify(resultado.error || resultado.mensaje),
                    },
                });

                fallas.push({ codigoGeneracion: dte.codigoGeneracion, error: resultado.error || resultado.mensaje });
            }
        } catch (dteError) {
            fallidos++;
            logger.error(`Error crítico procesando DTE ${dte.codigoGeneracion} en regularización`, { error: dteError.message });
            
            await prisma.dte.update({
                where: { id: dte.id },
                data: {
                    intentos: { increment: 1 },
                    errorLog: dteError.message,
                },
            });

            fallas.push({ codigoGeneracion: dte.codigoGeneracion, error: dteError.message });
        }
    }

    logger.info(`Sincronización de contingencia completada: ${exitosos} exitosos, ${fallidos} fallidos.`);

    return {
        exito: fallidos === 0,
        mensaje: `Regularización completada. Exitosos: ${exitosos}, Fallidos: ${fallidos}`,
        selloEvento: eventRes.selloRecibido,
        codigoGeneracionEvento: eventRes.codigoGeneracion,
        procesados: dtes.length,
        exitosos,
        fallidos,
        fallas
    };
};

module.exports = {
    construirDocumento,
    firmarYEnviar,
    procesarFactura,
    transmitirDirecto,
    reintentarEnvio,
    procesarContingencia,
    procesarEventoContingencia,
    regularizarContingencia,
};
