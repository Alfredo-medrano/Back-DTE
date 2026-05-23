/**
 * ========================================
 * CALCULADOR DE IVA Y TOTALES (Legacy Bridge)
 * ========================================
 * Este archivo fue reemplazado por el motor matemático blindado
 * basado en decimal.js en la arquitectura modular.
 * 
 * Mantiene la compatibilidad con scripts legacy exportando 
 * exactamente las mismas funciones pero usando la nueva lógica.
 */

const calculator = require('../modules/dte/services/dte-calculator.service');
const Decimal = require('decimal.js');

/**
 * Función legacy redondear8 (para compatibilidad)
 */
const redondear8 = (valor) => {
    return new Decimal(valor).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Función legacy calcularIVALinea (para compatibilidad)
 */
const calcularIVALinea = (montoTotal, precioIncluyeIva = true) => {
    const montoDecimal = new Decimal(montoTotal);
    let ventaGravada, ivaItem, precioConIva;

    if (precioIncluyeIva) {
        precioConIva = montoDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        ventaGravada = montoDecimal.dividedBy(1 + calculator.TASA_IVA).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        ivaItem = precioConIva.minus(ventaGravada).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
        ventaGravada = montoDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        ivaItem = montoDecimal.times(calculator.TASA_IVA).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        precioConIva = ventaGravada.plus(ivaItem).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    return { 
        ventaGravada: ventaGravada.toNumber(), 
        ivaItem: ivaItem.toNumber(), 
        precioConIva: precioConIva.toNumber() 
    };
};

module.exports = {
    ...calculator,
    redondear8,
    calcularIVALinea,
};
