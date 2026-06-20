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
const { adquirirLock, liberarLock } = require('../../shared/utils/lock');

const LIMITES = {
    BASICO: 100,
    PROFESIONAL: 500,
    EMPRESARIAL: 2000,
    ILIMITADO: Infinity,
};

/**
 * Cuenta los DTEs emitidos por el tenant en el mes actual.
 * Solo cuenta estados exitosos (PROCESADO) y en curso (CREADO, FIRMADO, ENVIADO).
 * Calcula el rango basado en la zona horaria de El Salvador (UTC-6).
 */
const contarDTEsMes = async (tenantId) => {
    // Obtener fecha/hora actual en la zona de El Salvador
    const svDateStr = new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" });
    const svDate = new Date(svDateStr);

    const year = svDate.getFullYear();
    const month = svDate.getMonth(); // 0-11

    // Crear el inicio del mes a las 00:00:00 del día 1 en UTC-6 (El Salvador)
    // Formato ISO: YYYY-MM-DDTHH:mm:ss-06:00
    const inicioMesStr = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00-06:00`;
    const inicioMes = new Date(inicioMesStr);

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
 * Usa un Mutex lock para prevenir condiciones de carrera (TOCTOU) bajo concurrencia.
 */
const checkPlanLimits = async (req, res, next) => {
    let lockKey = null;

    try {
        const { tenant } = req;
        const limiteMax = LIMITES[tenant.plan] ?? LIMITES.BASICO;

        // ILIMITADO — pasar directo sin query
        if (limiteMax === Infinity) return next();

        lockKey = `tenant:plan:${tenant.id}`;

        // Intentar adquirir el lock (reintentando hasta 5 veces con delay de 100ms)
        let lockAdquirido = false;
        for (let i = 0; i < 5; i++) {
            lockAdquirido = await adquirirLock(lockKey, 5000); // Lock con TTL de 5s por seguridad
            if (lockAdquirido) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!lockAdquirido) {
            return res.status(429).json({
                exito: false,
                codigo: 'CONCURRENCY_LOCK_FAILED',
                mensaje: 'Demasiadas solicitudes simultáneas para este plan. Por favor intenta de nuevo.',
            });
        }

        // Guardar lockKey en req para ser liberado en el controlador o catch
        req.planLockKey = lockKey;

        const usados = await contarDTEsMes(tenant.id);

        if (usados >= limiteMax) {
            logger.warn('Plan limit reached', {
                tenantId: tenant.id,
                plan: tenant.plan,
                usados,
                limite: limiteMax,
            });

            // Liberar lock inmediatamente ya que no procederemos a crear
            await liberarLock(lockKey);
            req.planLockKey = null;

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
        if (lockKey) {
            try {
                await liberarLock(lockKey);
            } catch (lockErr) {
                // Silencioso
            }
        }
        logger.error('Error checking plan limits', { error: error.message });
        
        // ISO 9001 8.5 — En producción: fail-closed para evitar bypass de cuotas.
        // En desarrollo: fail-open para no bloquear el flujo de testing.
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({
                exito: false,
                codigo: 'BILLING_CHECK_FAILED',
                mensaje: 'No se pudo verificar el límite de tu plan. Intenta de nuevo en unos segundos.',
            });
        }
        next();
    }
};

module.exports = {
    checkPlanLimits,
    LIMITES,
    contarDTEsMes,
};
