/**
 * ========================================
 * CONTROLADOR DE CONTINGENCIA
 * Módulo: DTE
 * ========================================
 * Maneja el estado y sincronización de contingencia manual y automática.
 */

const { prisma } = require('../../../shared/db');
const { dteOrchestrator } = require('../services');
const { tenantService } = require('../../iam/services');
const { BadRequestError, UnauthorizedError } = require('../../../shared/errors');
const { generarTimestampEmision } = require('../../../shared/utils');
const logger = require('../../../shared/logger');
const circuitBreaker = require('../../../shared/utils/circuit-breaker');
const crypto = require('crypto');

let cachedConexionMH = null;
let cachedAt = 0;
const TTL_MS = 30000;

const obtenerConexionMH = async () => {
    const ahora = Date.now();
    if (cachedConexionMH !== null && (ahora - cachedAt) < TTL_MS) {
        return cachedConexionMH;
    }

    // Usar la señal en memoria del circuit breaker
    const estados = circuitBreaker.estadoCircuitos();
    if (estados.HACIENDA_MH) {
        cachedConexionMH = estados.HACIENDA_MH.estado !== 'ABIERTO';
        cachedAt = ahora;
        return cachedConexionMH;
    }

    // Fallback: ping a Hacienda
    try {
        const axios = require('axios');
        const config = require('../../../config/env');
        const resp = await axios.get(`${config.mh.apiUrl}/seguridad/auth`, { timeout: 3000 });
        cachedConexionMH = resp.status === 200 || resp.status === 405;
    } catch (err) {
        cachedConexionMH = err.response ? err.response.status !== 503 : false;
    }
    cachedAt = ahora;
    return cachedConexionMH;
};

/**
 * Obtener estado de contingencia y conexión
 * GET /api/dte/v2/mi-cuenta/contingencia
 */
const obtenerEstado = async (req, res, next) => {
    try {
        const emisorId = req.emisor.id;
        
        // Buscar emisor en DB
        const emisor = await prisma.emisor.findUnique({
            where: { id: emisorId },
        });

        // Contar DTEs en contingencia
        const dtesContingencia = await prisma.dte.count({
            where: {
                emisorId,
                status: 'CONTINGENCIA',
            },
        });

        // Verificar conexión con MH (Health check con caché y circuit breaker)
        const conexionMH = await obtenerConexionMH();

        res.json({
            exito: true,
            datos: {
                contingenciaManual: emisor.contingenciaManual,
                tipoContingencia: emisor.contingenciaTipo,
                motivoContingencia: emisor.contingenciaMotivo,
                fechaInicio: emisor.contingenciaFInicio,
                horaInicio: emisor.contingenciaHInicio,
                dtesPendientes: dtesContingencia,
                conexionMH,
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Activar modo contingencia manual
 * POST /api/dte/v2/mi-cuenta/contingencia/activar
 */
const activarContingencia = async (req, res, next) => {
    try {
        const emisorId = req.emisor.id;
        const { passwordApi, tipoContingencia, motivoContingencia } = req.body;

        if (!passwordApi) {
            throw new BadRequestError('La contraseña API de Hacienda es requerida para validar la operación.');
        }

        const emisor = await prisma.emisor.findUnique({
            where: { id: emisorId },
        });

        // Validar contraseña de forma timing-safe
        const claveApiDecrypted = tenantService.desencriptar(emisor.mhClaveApi);
        const passwordBuffer = Buffer.from(passwordApi, 'utf8');
        const claveBuffer = Buffer.from(claveApiDecrypted, 'utf8');
        const esValida = passwordBuffer.length === claveBuffer.length &&
            crypto.timingSafeEqual(passwordBuffer, claveBuffer);

        if (!esValida) {
            throw new UnauthorizedError('Contraseña API de Hacienda incorrecta.');
        }

        const { fecha, hora } = generarTimestampEmision();

        // Actualizar emisor
        await prisma.emisor.update({
            where: { id: emisorId },
            data: {
                contingenciaManual: true,
                contingenciaTipo: parseInt(tipoContingencia || 1, 10),
                contingenciaMotivo: motivoContingencia || 'NO DISPONIBILIDAD DE SISTEMA DEL MH',
                contingenciaFInicio: fecha,
                contingenciaHInicio: hora,
            }
        });

        logger.info(`Modo contingencia manual ACTIVADO para emisor ${emisor.nit}`, { emisorId });

        res.json({
            exito: true,
            mensaje: 'Modo contingencia manual activado exitosamente.',
            datos: {
                fechaInicio: fecha,
                horaInicio: hora,
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Desactivar modo contingencia manual
 * POST /api/dte/v2/mi-cuenta/contingencia/desactivar
 */
const desactivarContingencia = async (req, res, next) => {
    try {
        const emisorId = req.emisor.id;
        const { passwordApi } = req.body;

        if (!passwordApi) {
            throw new BadRequestError('La contraseña API de Hacienda es requerida para validar la operación.');
        }

        const emisor = await prisma.emisor.findUnique({
            where: { id: emisorId },
        });

        // Validar contraseña de forma timing-safe
        const claveApiDecrypted = tenantService.desencriptar(emisor.mhClaveApi);
        const passwordBuffer = Buffer.from(passwordApi, 'utf8');
        const claveBuffer = Buffer.from(claveApiDecrypted, 'utf8');
        const esValida = passwordBuffer.length === claveBuffer.length &&
            crypto.timingSafeEqual(passwordBuffer, claveBuffer);

        if (!esValida) {
            throw new UnauthorizedError('Contraseña API de Hacienda incorrecta.');
        }

        // 1. Apagar flag de contingencia manual primero
        await prisma.emisor.update({
            where: { id: emisorId },
            data: {
                contingenciaManual: false,
            }
        });

        logger.info(`Modo contingencia manual DESACTIVADO para emisor ${emisor.nit}. Iniciando regularización en segundo plano...`, { emisorId });

        // 2. Disparar la regularización de la cola acumulada (asíncrono)
        dteOrchestrator.regularizarContingencia({
            emisorId,
            fInicio: emisor.contingenciaFInicio,
            hInicio: emisor.contingenciaHInicio,
            tipoContingencia: emisor.contingenciaTipo,
            motivoContingencia: emisor.contingenciaMotivo
        }).catch(err => {
            logger.error(`Error en regularización automática tras desactivar contingencia: ${err.message}`);
        });

        // 3. Limpiar fecha/hora de inicio en el emisor
        await prisma.emisor.update({
            where: { id: emisorId },
            data: {
                contingenciaFInicio: null,
                contingenciaHInicio: null,
            }
        });

        res.status(202).json({
            exito: true,
            mensaje: 'Modo contingencia manual desactivado. Regularización iniciada en segundo plano.',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Disparar regularización manualmente sin cambiar flags
 * POST /api/dte/v2/mi-cuenta/contingencia/regularizar
 */
const regularizarManual = async (req, res, next) => {
    try {
        const emisorId = req.emisor.id;
        
        logger.info(`Disparo manual de regularización de contingencia en segundo plano`, { emisorId });

        dteOrchestrator.regularizarContingencia({
            emisorId
        }).catch(err => {
            logger.error(`Error en regularización manual de contingencia: ${err.message}`);
        });

        res.status(202).json({
            exito: true,
            mensaje: 'Sincronización de contingencia iniciada en segundo plano.',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Limpiar la cola de contingencia (borrar todos los DTEs en estado CONTINGENCIA)
 * POST /api/dte/v2/mi-cuenta/contingencia/limpiar
 */
const limpiarContingencia = async (req, res, next) => {
    try {
        const emisorId = req.emisor.id;
        const { passwordApi } = req.body;

        if (!passwordApi) {
            throw new BadRequestError('La contraseña API de Hacienda es requerida para validar la operación.');
        }

        const emisor = await prisma.emisor.findUnique({
            where: { id: emisorId },
        });

        if (!emisor) {
            throw new BadRequestError('Emisor no encontrado.');
        }

        // Validar contraseña de forma timing-safe
        const claveApiDecrypted = tenantService.desencriptar(emisor.mhClaveApi);
        const passwordBuffer = Buffer.from(passwordApi, 'utf8');
        const claveBuffer = Buffer.from(claveApiDecrypted, 'utf8');
        const esValida = passwordBuffer.length === claveBuffer.length &&
            crypto.timingSafeEqual(passwordBuffer, claveBuffer);

        if (!esValida) {
            throw new UnauthorizedError('Contraseña API de Hacienda incorrecta.');
        }

        // 1. Borrar todos los DTEs en estado CONTINGENCIA para este emisor
        const resultado = await prisma.dte.deleteMany({
            where: {
                emisorId,
                status: 'CONTINGENCIA',
            },
        });

        logger.info(`Cola de contingencia LIMPIADA por el usuario para emisor ${emisor.nit}. Se eliminaron ${resultado.count} DTEs.`, { emisorId });

        // Registrar en audit log para cumplir normas de auditoría y trazabilidad
        const { auditLog } = require('../../../shared/middleware/audit-logger');
        await auditLog(req, {
            action: 'contingencia.limpiar',
            resource: 'Emisor',
            resourceId: emisorId,
            details: { eliminados: resultado.count }
        });

        res.json({
            exito: true,
            mensaje: `Se eliminaron exitosamente ${resultado.count} documentos en cola de contingencia.`,
            datos: {
                eliminados: resultado.count
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    obtenerEstado,
    activarContingencia,
    desactivarContingencia,
    regularizarManual,
    limpiarContingencia,
};
