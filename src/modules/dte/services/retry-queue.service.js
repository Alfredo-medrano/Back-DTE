/**
 * ========================================
 * SERVICIO: QUEUE DE REINTENTOS
 * ========================================
 * Procesa DTEs fallidos con reintentos exponenciales
 */

const { dteRepository } = require('../repositories');
const mhSender = require('./mh-sender.service');
const signerService = require('./signer.service');
const { tenantService } = require('../../iam');
const logger = require('../../../shared/logger');

/**
 * Configuración de reintentos
 */
const CONFIG = {
    maxIntentos: 3,
    delayBaseMs: 5000, // 5 segundos
    factorExponencial: 2,
};

/**
 * Cola en memoria de DTEs pendientes
 * En producción se usaría Redis/RabbitMQ
 */
let colaEnProceso = false;

/**
 * Procesa un DTE fallido con reintento
 * @param {object} dte - DTE desde BD
 */
const procesarReintento = async (dte) => {
    logger.info('Reintentando DTE', { codigoGeneracion: dte.codigoGeneracion, intento: dte.intentos + 1 });

    try {
        // Obtener emisor con credenciales
        const emisor = await tenantService.obtenerEmisorConCredenciales(dte.emisorId);

        if (!emisor) {
            throw new Error('Emisor no encontrado');
        }

        // Re-firmar documento
        const resultadoFirma = await signerService.firmarDocumento({
            documento: dte.jsonOriginal,
            nit: emisor.nit,
            clavePrivada: emisor.mhClavePrivada,
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Error de firma: ${resultadoFirma.error}`);
        }

        // Re-enviar a Hacienda
        const resultadoMH = await mhSender.enviarDTE({
            documentoFirmado: resultadoFirma.firma,
            ambiente: emisor.ambiente,
            tipoDte: dte.tipoDte,
            version: dte.version,
            codigoGeneracion: dte.codigoGeneracion,
            credenciales: {
                nit: emisor.nit,
                claveApi: emisor.mhClaveApi,
            },
        });

        if (resultadoMH.exito) {
            // Actualizar a PROCESADO
            await dteRepository.actualizarEstado(dte.id, {
                status: 'PROCESADO',
                selloRecibido: resultadoMH.selloRecibido,
                fechaProcesamiento: resultadoMH.fechaProcesamiento,
                jsonFirmado: resultadoFirma.firma,
            });
            logger.info('DTE procesado en reintento', { codigoGeneracion: dte.codigoGeneracion });
            return { exito: true };
        } else {
            // Sigue fallando
            await dteRepository.actualizarEstado(dte.id, {
                status: dte.intentos + 1 >= CONFIG.maxIntentos ? 'RECHAZADO' : 'ERROR',
                observaciones: JSON.stringify(resultadoMH.observaciones),
                errorLog: JSON.stringify(resultadoMH.error),
            });
            logger.warn('DTE falló en reintento', { codigoGeneracion: dte.codigoGeneracion });
            return { exito: false, error: resultadoMH.error };
        }

    } catch (error) {
        await dteRepository.actualizarEstado(dte.id, {
            status: dte.intentos + 1 >= CONFIG.maxIntentos ? 'RECHAZADO' : 'ERROR',
            errorLog: error.message,
        });
        logger.error('Error en reintento', { error: error.message });
        return { exito: false, error: error.message };
    }
};

/**
 * Ejecuta ciclo de procesamiento de cola
 */
const procesarCola = async () => {
    if (colaEnProceso) {
        logger.debug('Cola ya en proceso, saltando');
        return;
    }

    colaEnProceso = true;
    logger.info('Iniciando procesamiento de cola de reintentos');

    try {
        const pendientes = await dteRepository.pendientesReintento(CONFIG.maxIntentos);
        logger.info('DTEs pendientes de reintento', { count: pendientes.length });

        for (const dte of pendientes) {
            // Delay exponencial entre reintentos
            const delay = CONFIG.delayBaseMs * Math.pow(CONFIG.factorExponencial, dte.intentos);
            await new Promise(resolve => setTimeout(resolve, delay));

            await procesarReintento(dte);
        }

    } catch (error) {
        logger.error('Error en cola de reintentos', { error: error.message });
    } finally {
        colaEnProceso = false;
    }
};

/**
 * Inicia procesamiento periódico (cada 5 minutos)
 */
const iniciarProcesadorPeriodico = (intervaloMinutos = 5) => {
    const intervaloMs = intervaloMinutos * 60 * 1000;
    logger.info('Procesador de reintentos iniciado', { intervaloMinutos });

    // Ejecutar inmediatamente al iniciar
    procesarCola();

    // Luego cada intervalo
    return setInterval(procesarCola, intervaloMs);
};

module.exports = {
    procesarReintento,
    procesarCola,
    iniciarProcesadorPeriodico,
    CONFIG,
};
