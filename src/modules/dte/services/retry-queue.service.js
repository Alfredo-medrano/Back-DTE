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
    console.log(`🔄 Reintentando DTE: ${dte.codigoGeneracion} (intento ${dte.intentos + 1})`);

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
            console.log(`✅ DTE ${dte.codigoGeneracion} procesado exitosamente en reintento`);
            return { exito: true };
        } else {
            // Sigue fallando
            await dteRepository.actualizarEstado(dte.id, {
                status: dte.intentos + 1 >= CONFIG.maxIntentos ? 'RECHAZADO' : 'ERROR',
                observaciones: JSON.stringify(resultadoMH.observaciones),
                errorLog: JSON.stringify(resultadoMH.error),
            });
            console.log(`❌ DTE ${dte.codigoGeneracion} falló en reintento`);
            return { exito: false, error: resultadoMH.error };
        }

    } catch (error) {
        await dteRepository.actualizarEstado(dte.id, {
            status: dte.intentos + 1 >= CONFIG.maxIntentos ? 'RECHAZADO' : 'ERROR',
            errorLog: error.message,
        });
        console.error(`❌ Error en reintento: ${error.message}`);
        return { exito: false, error: error.message };
    }
};

/**
 * Ejecuta ciclo de procesamiento de cola
 */
const procesarCola = async () => {
    if (colaEnProceso) {
        console.log('⏳ Cola ya en proceso, saltando...');
        return;
    }

    colaEnProceso = true;
    console.log('🚀 Iniciando procesamiento de cola de reintentos...');

    try {
        const pendientes = await dteRepository.pendientesReintento(CONFIG.maxIntentos);
        console.log(`📋 ${pendientes.length} DTEs pendientes de reintento`);

        for (const dte of pendientes) {
            // Delay exponencial entre reintentos
            const delay = CONFIG.delayBaseMs * Math.pow(CONFIG.factorExponencial, dte.intentos);
            await new Promise(resolve => setTimeout(resolve, delay));

            await procesarReintento(dte);
        }

    } catch (error) {
        console.error('❌ Error en cola de reintentos:', error.message);
    } finally {
        colaEnProceso = false;
    }
};

/**
 * Inicia procesamiento periódico (cada 5 minutos)
 */
const iniciarProcesadorPeriodico = (intervaloMinutos = 5) => {
    const intervaloMs = intervaloMinutos * 60 * 1000;
    console.log(`⏰ Procesador de reintentos iniciado (cada ${intervaloMinutos} min)`);

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
