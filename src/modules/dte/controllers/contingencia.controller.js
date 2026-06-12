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

        // Verificar conexión con MH (Health check rápido o ping)
        let conexionMH = false;
        try {
            const axios = require('axios');
            const config = require('../../../config/env');
            // Intentar conectar al endpoint auth
            const resp = await axios.get(`${config.mh.apiUrl}/seguridad/auth`, { timeout: 3000 });
            conexionMH = resp.status === 200 || resp.status === 405; // 405 Method Not Allowed es aceptable ya que es un GET
        } catch (err) {
            // Si responde con un estado HTTP distinto a 503, se asume online
            conexionMH = err.response ? err.response.status !== 503 : false;
        }

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

        // Validar contraseña
        const claveApiDecrypted = tenantService.desencriptar(emisor.mhClaveApi);
        if (passwordApi !== claveApiDecrypted) {
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

        // Validar contraseña
        const claveApiDecrypted = tenantService.desencriptar(emisor.mhClaveApi);
        if (passwordApi !== claveApiDecrypted) {
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

module.exports = {
    obtenerEstado,
    activarContingencia,
    desactivarContingencia,
    regularizarManual,
};
