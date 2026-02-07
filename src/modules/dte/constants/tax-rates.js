/**
 * ========================================
 * CONSTANTES DE TASAS TRIBUTARIAS
 * Módulo: DTE
 * ========================================
 */

// Tasa de IVA estándar El Salvador
const IVA_RATE = 0.13;

// Retención de renta para sujetos excluidos
const RETENCION_RENTA_RATE = 0.10;

// Límite mínimo para aplicar retención (si aplica)
const LIMITE_RETENCION = 100.00;

module.exports = {
    IVA_RATE,
    RETENCION_RENTA_RATE,
    LIMITE_RETENCION,
};
