/**
 * ========================================
 * PLAN LIMITS — Billing Enforcement
 * Módulo: Billing
 * ========================================
 * Middleware que verifica si el tenant puede
 * emitir más DTEs según su plan del mes actual.
 *
 * Planes:
 *  BASICO       →   100 DTEs/mes
 *  PROFESIONAL  →   500 DTEs/mes
 *  EMPRESARIAL  →  2000 DTEs/mes
 *  ILIMITADO    →  sin límite
 */

const { prisma } = require('../../shared/db');
const logger = require('../../shared/logger');

const LIMITES = {
    BASICO: 100,
    PROFESIONAL: 500,
    EMPRESARIAL: 2000,
    ILIMITADO: Infinity,
};

/**
 * Cuenta los DTEs emitidos por el tenant en el mes actual.
 * Solo cuenta estados exitosos (PROCESADO) y en curso (CREADO, FIRMADO, ENVIADO).
 */
const contarDTEsMes = async (tenantId) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    return await prisma.dte.count({
        where: {
            tenantId,
            createdAt: { gte: inicioMes },
            status: { in: ['CREADO', 'VALIDADO', 'FIRMADO', 'ENVIADO', 'PROCESADO'] },
        },
    });
};

/**
 * Middleware: verifica que el tenant no haya superado el límite mensual.
 * Se monta en POST /api/dte/v2/facturar
 */
const checkPlanLimits = async (req, res, next) => {
    try {
        const { tenant } = req;

        const limiteMax = LIMITES[tenant.plan] ?? LIMITES.BASICO;

        // ILIMITADO — pasar directo sin query
        if (limiteMax === Infinity) return next();

        const usados = await contarDTEsMes(tenant.id);

        if (usados >= limiteMax) {
            logger.warn('Plan limit reached', {
                tenantId: tenant.id,
                plan: tenant.plan,
                usados,
                limite: limiteMax,
            });

            return res.status(402).json({
                exito: false,
                codigo: 'PLAN_LIMIT_REACHED',
                mensaje: `Has alcanzado el límite de ${limiteMax} DTEs/mes para el plan ${tenant.plan}.`,
                detalle: {
                    plan: tenant.plan,
                    usados,
                    limite: limiteMax,
                    renovacion: 'El contador se reinicia el primer día del mes.',
                },
            });
        }

        // Adjuntar info de uso para que el response pueda incluirlo
        req.planInfo = { plan: tenant.plan, usados, limite: limiteMax, disponibles: limiteMax - usados };
        next();
    } catch (error) {
        logger.error('Error checking plan limits', { error: error.message });
        // En caso de fallo del check, dejar pasar (fail-open)
        // para no bloquear facturación por error de infraestructura
        next();
    }
};

module.exports = {
    checkPlanLimits,
    LIMITES,
    contarDTEsMes,
};
