#!/usr/bin/env node
/**
 * ========================================
 * WORKER: TRANSMISIÓN DE DTEs EN CONTINGENCIA
 * ========================================
 * 
 * Busca DTEs emitidos bajo contingencia (estado CONTINGENCIA)
 * y los transmite en orden FIFO al Ministerio de Hacienda
 * cuando la conectividad se restablece.
 * 
 * Uso:
 *   node src/modules/dte/workers/contingency-worker.js
 * 
 * @author QA Automation
 * @version 1.0.0
 */

require('dotenv').config();
const { prisma } = require('../../../shared/db/prisma');
const { emailDelivery, mhSender, signer, dteOrchestrator } = require('../services');
const { tenantService } = require('../../iam');
const circuitBreaker = require('../../../shared/utils/circuit-breaker');

const CONFIG = {
    batchSize: parseInt(process.env.CONTINGENCY_BATCH_SIZE) || 10,
    intervaloMs: parseInt(process.env.CONTINGENCY_INTERVAL_MS) || 120000, // 2 minutos por defecto
    modoUnico: process.env.CONTINGENCY_RUN_ONCE === 'true',
    // FIX: Límite máximo de reintentos para errores de comunicación.
    // Sin este límite, un MH permanentemente caído causaba reintentos infinitos.
    maxReintentos: parseInt(process.env.CONTINGENCY_MAX_RETRIES) || 20,
};

const C = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m',
};

const log = {
    info: (msg) => console.log(`${C.CYAN}[CONTINGENCY-WORKER]${C.RESET} ${msg}`),
    success: (msg) => console.log(`${C.GREEN}[CONTINGENCY-WORKER]${C.RESET} ${msg}`),
    warn: (msg) => console.log(`${C.YELLOW}[CONTINGENCY-WORKER]${C.RESET} ${msg}`),
    error: (msg) => console.error(`${C.RED}[CONTINGENCY-WORKER]${C.RESET} ${msg}`),
    debug: (msg) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`${C.DIM}[DEBUG] ${msg}${C.RESET}`);
        }
    },
};

/**
 * Obtiene DTEs en estado CONTINGENCIA ordenados cronológicamente (FIFO)
 */
async function obtenerDTEsContingencia() {
    return await prisma.dte.findMany({
        where: {
            status: 'CONTINGENCIA',
        },
        include: {
            emisor: true,
            tenant: true,
        },
        take: CONFIG.batchSize,
        orderBy: {
            createdAt: 'asc', // FIFO
        },
    });
}

/**
 * Procesa y transmite un DTE en contingencia individual.
 *
 * NORMATIVA MH: El DTE individual NO lleva marcas de contingencia en su JSON.
 * Por eso se usa jsonOriginal (limpio, sin tipoContingencia/motivoContin)
 * y se RE-FIRMA antes de transmitir, en vez de reusar el jsonFirmado anterior.
 */
async function transmitirDTE(dte) {
    const { codigoGeneracion, emisor, fechaLimiteTransmision } = dte;

    // Verificar si el límite de 24 horas está próximo a vencer (menos de 2 horas)
    if (fechaLimiteTransmision) {
        const tiempoRestanteMs = new Date(fechaLimiteTransmision) - new Date();
        const horasRestantes = tiempoRestanteMs / (1000 * 60 * 60);
        if (horasRestantes <= 2) {
            log.error(`🚨 ALERTA CRÍTICA DE EXPIRACIÓN: El DTE ${codigoGeneracion} está a ${horasRestantes.toFixed(2)} horas de expirar su límite de contingencia de 24 horas.`);
        }
    }

    try {
        // Obtener credenciales desencriptadas
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        if (!dte.jsonOriginal) {
            throw new Error(`DTE ${codigoGeneracion} no tiene jsonOriginal guardado`);
        }

        // Limpiar el jsonOriginal para la transmisión (Normativa MH: no marcas de contingencia)
        const documentoDTE = JSON.parse(JSON.stringify(dte.jsonOriginal));
        if (documentoDTE.identificacion) {
            documentoDTE.identificacion.tipoOperacion = 1;
            documentoDTE.identificacion.tipoModelo = 1;
            documentoDTE.identificacion.tipoContingencia = null;
            documentoDTE.identificacion.motivoContin = null;
        }

        log.info(`Firmando DTE limpio para transmisión: ${codigoGeneracion}`);
        const resultadoFirma = await signer.firmarDocumento({
            documento: documentoDTE,
            nit: emisorConCredenciales.nit,
            clavePrivada: emisorConCredenciales.mhClavePrivada,
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Error al re-firmar documento en contingencia: ${resultadoFirma.error}`);
        }

        log.info(`Transmitiendo DTE en contingencia: ${codigoGeneracion}`);
        const resultado = await mhSender.enviarDTE({
            documentoFirmado: resultadoFirma.firma,
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
                    jsonFirmado: resultadoFirma.firma,
                    errorLog: null,
                    observaciones: 'Transmitido y sellado exitosamente tras periodo de contingencia.',
                },
            });

            log.success(`✅ ${codigoGeneracion} transmitido y sellado por Hacienda exitosamente.`);

            // Enviar correo de notificación al receptor
            try {
                await emailDelivery.enviarCorreoFactura({ dte: dteActualizado, emisor });
            } catch (mailError) {
                log.warn(`⚠️ Error al enviar correo para DTE ${codigoGeneracion}: ${mailError.message}`);
            }

            return { success: true };
        } else {
            // El MH rechazó la estructura o hay otro problema (no de conexión)
            log.warn(`⚠️ Transmisión fallida para DTE ${codigoGeneracion}: ${resultado.observaciones || resultado.mensaje}`);
            
            // Si no es un problema de conexión/comunicación (es decir, el MH rechazó el contenido del DTE)
            // cambiamos el estado a RECHAZADO para evitar reenvíos infinitos de un DTE mal formado.
            const esErrorFisico = resultado.mensaje === 'DTE rechazado por Hacienda' || resultado.estado === 'RECHAZADO';
            if (esErrorFisico) {
                await prisma.dte.update({
                    where: { id: dte.id },
                    data: {
                        status: 'RECHAZADO',
                        observaciones: JSON.stringify(resultado.observaciones || resultado.error),
                        errorLog: 'Rechazado por Hacienda durante transmisión diferida.',
                    },
                });
                log.error(`❌ DTE ${codigoGeneracion} rechazado permanentemente por Hacienda.`);
            } else {
                // Si es un error de comunicación, verificar límite de reintentos
                // FIX: Sin este límite, un MH permanentemente caído causaba reintentos infinitos.
                const intentosActuales = (dte.intentos || 0) + 1;

                if (intentosActuales >= CONFIG.maxReintentos) {
                    await prisma.dte.update({
                        where: { id: dte.id },
                        data: {
                            status: 'RECHAZADO',
                            intentos: intentosActuales,
                            observaciones: `Abandonado tras ${intentosActuales} intentos fallidos de comunicación. Requiere intervención manual.`,
                            errorLog: resultado.mensaje || 'Máximo de reintentos alcanzado',
                        },
                    });
                    log.error(`❌ DTE ${codigoGeneracion} abandonado tras ${intentosActuales} intentos. Requiere intervención manual.`);
                } else {
                    await prisma.dte.update({
                        where: { id: dte.id },
                        data: {
                            intentos: { increment: 1 },
                            errorLog: resultado.mensaje || 'Error temporal de comunicación',
                        },
                    });
                    log.warn(`⚠️ DTE ${codigoGeneracion}: intento ${intentosActuales}/${CONFIG.maxReintentos} fallido por error de comunicación.`);
                }
            }

            return { success: false };
        }
    } catch (error) {
        log.error(`❌ Error crítico al procesar contingencia para DTE ${codigoGeneracion}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Ciclo principal del worker
 */
async function ejecutarCiclo() {
    log.info('Comprobando DTEs en estado de CONTINGENCIA...');

    // Si el circuit breaker general indica que Hacienda sigue caída, omitir transmisiones para evitar bloqueos
    if (!circuitBreaker.puedeEjecutar('HACIENDA_MH')) {
        log.warn('El Circuit Breaker de HACIENDA_MH está ABIERTO. Saltando este ciclo de transmisión.');
        return { procesados: 0, exitosos: 0 };
    }

    const dtes = await obtenerDTEsContingencia();

    if (dtes.length === 0) {
        log.info('No hay DTEs en contingencia pendientes de transmisión.');
        return { procesados: 0, exitosos: 0 };
    }

    // Agrupar DTEs por emisorId (multi-tenant)
    const grupos = {};
    for (const dte of dtes) {
        if (!grupos[dte.emisorId]) {
            grupos[dte.emisorId] = [];
        }
        grupos[dte.emisorId].push(dte);
    }

    log.info(`Encontrados ${dtes.length} DTEs en contingencia para ${Object.keys(grupos).length} emisor(es).`);

    let totalProcesados = 0;
    let totalExitosos = 0;

    for (const emisorId of Object.keys(grupos)) {
        try {
            log.info(`Regularizando contingencia para emisor ID: ${emisorId}...`);
            const resultado = await dteOrchestrator.regularizarContingencia({ emisorId });
            
            totalProcesados += resultado.procesados;
            totalExitosos += resultado.exitosos;

            if (resultado.exito) {
                log.success(`✅ Regularización completada con éxito para emisor ID ${emisorId}.`);
            } else {
                log.warn(`⚠️ Regularización parcial para emisor ID ${emisorId}: ${resultado.exitosos}/${resultado.procesados} exitosos.`);
            }
        } catch (err) {
            log.error(`❌ Error al regularizar emisor ID ${emisorId}: ${err.message}`);
        }
    }

    log.info(`Ciclo de contingencia completado: ${totalExitosos}/${totalProcesados} procesados con éxito.`);
    return { procesados: totalProcesados, exitosos: totalExitosos };
}

/**
 * Bucle de inicio
 */
async function iniciar() {
    console.log(`
${C.CYAN}╔═══════════════════════════════════════════╗
║     DTE CONTINGENCY WORKER                ║
║     Transmisión diferida (FIFO)           ║
╚═══════════════════════════════════════════╝${C.RESET}
`);

    log.info(`Configuración:`);
    log.info(`  • Batch size: ${CONFIG.batchSize}`);
    log.info(`  • Intervalo: ${CONFIG.intervaloMs}ms`);
    log.info(`  • Modo único: ${CONFIG.modoUnico}`);
    console.log('');

    if (CONFIG.modoUnico) {
        await ejecutarCiclo();
        await prisma.$disconnect();
        process.exit(0);
    } else {
        while (true) {
            try {
                await ejecutarCiclo();
            } catch (err) {
                log.error(`Error durante la ejecución del ciclo: ${err.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, CONFIG.intervaloMs));
        }
    }
}

let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.info(`Recibida señal ${signal}, apagando worker de contingencia...`);
    await prisma.$disconnect();
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
    iniciar().catch(err => {
        log.error(`Error fatal: ${err.message}`);
        process.exit(1);
    });
}

module.exports = {
    ejecutarCiclo,
    transmitirDTE,
    obtenerDTEsContingencia,
};
