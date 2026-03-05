/**
 * ========================================
 * MÓDULO BILLING
 * ========================================
 */

const { checkPlanLimits, LIMITES, contarDTEsMes } = require('./plan-limits');

module.exports = {
    checkPlanLimits,
    LIMITES,
    contarDTEsMes,
};
