#!/usr/bin/env node
/**
 * ========================================
 * WORKER: REINTENTOS DE DTEs FALLIDOS
 * ========================================
 * 
 * Procesa DTEs que quedaron en estado ERROR o RECHAZADO
 * y reintenta su envío a Hacienda.
 * 
 * Uso:
 *   node src/modules/dte/workers/retry-worker.js
 *   npm run worker:retries
 * 
 * Con PM2:
 *   pm2 start ecosystem.config.js --only dte-worker
 * 
 * @author QA Automation
 * @version 1.0.0
 */

require('dotenv').config();
const { prisma } = require('../../../shared/db/prisma');
const { dteOrchestrator } = require('../services');
const { tenantService } = require('../../iam');

// ========================================
// CONFIGURACIÓN
// ========================================

const CONFIG = {
    maxIntentos: parseInt(process.env.RETRY_MAX_ATTEMPTS) || 5,
    batchSize: parseInt(process.env.RETRY_BATCH_SIZE) || 10,
    intervaloMs: parseInt(process.env.RETRY_INTERVAL_MS) || 30000, // 30 segundos
    modoUnico: process.env.RETRY_RUN_ONCE === 'true',
};

// Colores para consola
const C = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m',
};

const log = {
    info: (msg) => console.log(`${C.CYAN}[WORKER]${C.RESET} ${msg}`),
    success: (msg) => console.log(`${C.GREEN}[WORKER]${C.RESET} ${msg}`),
    warn: (msg) => console.log(`${C.YELLOW}[WORKER]${C.RESET} ${msg}`),
    error: (msg) => console.error(`${C.RED}[WORKER]${C.RESET} ${msg}`),
    debug: (msg) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`${C.DIM}[DEBUG] ${msg}${C.RESET}`);
        }
    },
};

// ========================================
// WORKER PRINCIPAL
// ========================================

/**
 * Obtiene DTEs pendientes de reintento
 */
async function obtenerDTEsPendientes() {
    return await prisma.dte.findMany({
        where: {
            status: {
                in: ['ERROR', 'RECHAZADO'],
            },
            intentos: {
                lt: CONFIG.maxIntentos,
            },
        },
        include: {
            emisor: true,
            tenant: true,
        },
        take: CONFIG.batchSize,
        orderBy: [
            { intentos: 'asc' }, // Primero los que tienen menos intentos
            { createdAt: 'asc' }, // Luego los más antiguos
        ],
    });
}

/**
 * Procesa un DTE individual
 */
async function procesarDTE(dte) {
    const { codigoGeneracion, emisor, tenant } = dte;
    const intentoActual = dte.intentos + 1;

    log.debug(`Procesando ${codigoGeneracion} (intento ${intentoActual}/${CONFIG.maxIntentos})`);

    try {
        // Obtener credenciales desencriptadas
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Reintentar envío
        const resultado = await dteOrchestrator.reintentarEnvio({
            dte,
            emisor: emisorConCredenciales,
        });

        if (resultado.exito) {
            // Actualizar a PROCESADO
            await prisma.dte.update({
                where: { id: dte.id },
                data: {
                    status: 'PROCESADO',
                    selloRecibido: resultado.datos?.selloRecibido,
                    fechaProcesamiento: new Date(),
                    intentos: intentoActual,
                    errorLog: null,
                },
            });

            log.success(`✅ ${codigoGeneracion} procesado exitosamente`);
            return { success: true };
        } else {
            // Incrementar intentos y guardar error
            await prisma.dte.update({
                where: { id: dte.id },
                data: {
                    intentos: intentoActual,
                    errorLog: resultado.error?.mensaje || resultado.observaciones || 'Error desconocido',
                },
            });

            log.warn(`⚠️ ${codigoGeneracion} falló (intento ${intentoActual}): ${resultado.error?.mensaje}`);
            return { success: false, error: resultado.error };
        }
    } catch (error) {
        // Guardar error crítico
        await prisma.dte.update({
            where: { id: dte.id },
            data: {
                intentos: intentoActual,
                errorLog: `Error interno: ${error.message}`,
            },
        });

        log.error(`❌ ${codigoGeneracion} error crítico: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Ciclo principal del worker
 */
async function ejecutarCiclo() {
    const inicio = Date.now();
    log.info(`Iniciando ciclo de reintentos (batch: ${CONFIG.batchSize}, max: ${CONFIG.maxIntentos})`);

    const dtesPendientes = await obtenerDTEsPendientes();

    if (dtesPendientes.length === 0) {
        log.info('No hay DTEs pendientes de reintento');
        return { procesados: 0, exitosos: 0, fallidos: 0 };
    }

    log.info(`Encontrados ${dtesPendientes.length} DTEs para procesar`);

    let exitosos = 0;
    let fallidos = 0;

    for (const dte of dtesPendientes) {
        const resultado = await procesarDTE(dte);
        if (resultado.success) {
            exitosos++;
        } else {
            fallidos++;
        }

        // Pequeña pausa entre DTEs para no saturar Hacienda
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const duracion = ((Date.now() - inicio) / 1000).toFixed(2);
    log.info(`Ciclo completado en ${duracion}s: ${exitosos} exitosos, ${fallidos} fallidos`);

    return { procesados: dtesPendientes.length, exitosos, fallidos };
}

/**
 * Ejecuta el worker en modo loop o único
 */
async function iniciar() {
    console.log(`
${C.CYAN}╔═══════════════════════════════════════════╗
║     DTE RETRY WORKER                      ║
║     Reintentos automáticos                ║
╚═══════════════════════════════════════════╝${C.RESET}
`);

    log.info(`Configuración:`);
    log.info(`  • Max intentos: ${CONFIG.maxIntentos}`);
    log.info(`  • Batch size: ${CONFIG.batchSize}`);
    log.info(`  • Intervalo: ${CONFIG.intervaloMs}ms`);
    log.info(`  • Modo único: ${CONFIG.modoUnico}`);
    console.log('');

    if (CONFIG.modoUnico) {
        // Ejecutar una vez y salir
        await ejecutarCiclo();
        await prisma.$disconnect();
        process.exit(0);
    } else {
        // Modo loop infinito
        while (true) {
            try {
                await ejecutarCiclo();
            } catch (error) {
                log.error(`Error en ciclo: ${error.message}`);
            }

            log.debug(`Esperando ${CONFIG.intervaloMs}ms hasta el próximo ciclo...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.intervaloMs));
        }
    }
}

// ========================================
// MANEJO DE SEÑALES
// ========================================

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Recibida señal ${signal}, cerrando worker...`);
    await prisma.$disconnect();
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========================================
// INICIO
// ========================================

iniciar().catch(error => {
    log.error(`Error fatal: ${error.message}`);
    console.error(error);
    process.exit(1);
});
