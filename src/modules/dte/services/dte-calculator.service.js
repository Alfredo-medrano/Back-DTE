/**
 * ========================================
 * SERVICIO CALCULADORA DTE
 * Módulo: DTE
 * ========================================
 * Cálculos fiscales según normativa salvadoreña (Anexo II)
 * 
 * Migrado desde: src/utils/calculadorIVA.js
 */const {
    obtenerConfigDTE,
    generarTributosCuerpo,
    generarTributosResumen,
    IVA_RATE,
    getFiscalLogic,
} = require('../constants');

const Decimal = require('decimal.js');

/**
 * Redondea a N decimales (regla fiscal) usando decimal.js
 * @param {number|Decimal} valor - Valor a redondear
 * @param {number} decimales - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
const redondear = (valor, decimales = 2) => {
    if (valor === undefined || valor === null) return 0;
    return new Decimal(valor).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP).toNumber();
};

/**
 * Calcula una línea de producto para el cuerpoDocumento
 * @param {object} item - Item del producto
 * @param {number} numItem - Número de línea
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {object} Línea formateada según Anexo II
 */
const calcularLineaProducto = (item, numItem, tipoDte = '01') => {
    const tipoItem = item.tipoItem || 1;

    const logic = getFiscalLogic(tipoDte);
    const precioIncluyeIva = logic.calculaIvaInverso;
    const usaTributos = logic.usaTributos;

    const cantidad = new Decimal(item.cantidad || 0);
    let precioUnitario = new Decimal(item.precioUnitario || item.precioUni || 0);
    const descuento = new Decimal(item.descuento || item.montoDescu || 0);

    // ════════════════════════════════════════════════════════════
    // ADAPTACIÓN B2B/B2C: Inyección de IVA en Facturas (DTE-01)
    // Si la plataforma guarda precios SIN IVA (ej. $20) pero 
    // Hacienda exige precios CON IVA en Facturas, le sumamos el 13%.
    // ════════════════════════════════════════════════════════════
    if (tipoDte === '01' && (item.precioSinIva === true || item.preciosSinIva === true)) {
        precioUnitario = precioUnitario.mul(new Decimal(1).add(IVA_RATE));
    }

    const montoBruto = cantidad.mul(precioUnitario);
    const montoNeto = montoBruto.sub(descuento);

    let precioUni, ventaGravada, ivaItem;

    if (precioIncluyeIva) {
        precioUni = precioUnitario; // Preserva el precio unitario ingresado con IVA por ley DTE-01
        const divisor = new Decimal(logic.divisorIva); // 1.13
        
        // MH requiere que cantidad * precioUni == ventaGravada. Por tanto, ventaGravada INCLUYE IVA.
        ventaGravada = montoNeto.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
        
        // Calculamos el ivaItem (Monto - Monto/1.13) como información
        const montoSinIva = montoNeto.div(divisor).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
        ivaItem = montoNeto.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).sub(montoSinIva);
    } else if (tipoDte === '14' || tipoDte === '11') {
        precioUni = precioUnitario;
        ventaGravada = montoNeto.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
        ivaItem = new Decimal(0);
    } else {
        precioUni = precioUnitario;
        ventaGravada = montoNeto.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
        ivaItem = montoNeto.mul(logic.tasaIva).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
    }

    let uniMedida = 59;
    if (tipoItem === 2) uniMedida = 99;
    if (item.unidadMedida || item.uniMedida) {
        uniMedida = item.unidadMedida || item.uniMedida;
    }

    const tributos = usaTributos ? generarTributosCuerpo(tipoDte) : null;

    // ═══════════════════════════════════════════════════
    // DTE-15 (CD): estructura completamente diferente —
    // usa campo "donacion" en lugar de ventaGravada/ivaItem
    // ═══════════════════════════════════════════════════
    if (tipoDte === '15') {
        return {
            numItem,
            cantidad: cantidad.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber(),
            codigo: item.codigo || null,
            uniMedida,
            descripcion: (item.descripcion || '').toUpperCase(),
            precioUni: precioUni.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
            montoDescu: descuento.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
            donacion: montoNeto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        };
    }

    // Tipos de DTE donde Hacienda PROHÍBE ivaItem en el detalle
    const sinIvaItem = ['03', '04', '05', '06', '14'].includes(tipoDte);
    // NC/ND (05/06) y FSE (14) prohíben psv y noGravado
    const sinPsvNoGravado = ['05', '06', '14'].includes(tipoDte);
    // NC/ND requieren numeroDocumento como string no nulo
    const numeroDocumento = ['05', '06'].includes(tipoDte) ? (item.numeroDocumento || item.codigo || 'S/N') : null;

    const linea = {
        numItem,
        tipoItem,
        numeroDocumento,
        cantidad: cantidad.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber(),
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida,
        descripcion: (item.descripcion || '').toUpperCase(),
        precioUni: precioUni.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber(),
        montoDescu: descuento.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toNumber(),
    };

    if (tipoDte === '14') {
        linea.compra = ventaGravada.toNumber();
    } else {
        linea.ventaNoSuj = 0.00;
        linea.ventaExenta = 0.00;
        linea.ventaGravada = ventaGravada.toNumber();
        linea.tributos = tributos;
    }

    // psv/noGravado: requeridos en FE-01 y CCF-03, PROHIBIDOS en NC-05 y ND-06
    if (!sinPsvNoGravado) {
        linea.psv = 0.00;
        linea.noGravado = 0.00;
    }

    // ivaItem: solo en FE-01 (y similares que incluyen precio con IVA)
    if (!sinIvaItem) {
        linea.ivaItem = ivaItem.toNumber();
    }

    return linea;
};

/**
 * Calcula el resumen completo de una factura según Anexo II
 * @param {Array} lineas - Array de líneas del cuerpoDocumento
 * @param {number} condicionOperacion - 1=Contado, 2=Crédito, 3=Otro
 * @param {string} tipoDte - Código del tipo de DTE
 * @param {object} [datosPago] - Datos de pago opcionales {codigo, referencia, plazo, periodo}
 * @returns {object} Resumen formateado según Anexo II
 */
const calcularResumenFactura = (lineas, condicionOperacion = 1, tipoDte = '01', datosPago = {}) => {
    const logic = getFiscalLogic(tipoDte);
    const precioIncluyeIva = logic.calculaIvaInverso;
    const usaTributos = logic.usaTributos;

    let totalNoSuj = new Decimal(0);
    let totalExenta = new Decimal(0);
    let totalGravada = new Decimal(0);
    let totalDescuento = new Decimal(0);
    let totalIva = new Decimal(0);

    lineas.forEach(linea => {
        if (tipoDte === '14') {
            totalGravada = totalGravada.add(linea.compra || 0);
        } else if (tipoDte === '15') {
            // CD: acumular el campo donacion
            totalGravada = totalGravada.add(linea.donacion || 0);
        } else {
            totalNoSuj = totalNoSuj.add(linea.ventaNoSuj || 0);
            totalExenta = totalExenta.add(linea.ventaExenta || 0);
            totalGravada = totalGravada.add(linea.ventaGravada || 0);
            totalIva = totalIva.add(linea.ivaItem || 0);
        }
        totalDescuento = totalDescuento.add(linea.montoDescu || 0);
    });

    totalNoSuj = totalNoSuj.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalExenta = totalExenta.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalGravada = totalGravada.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalDescuento = totalDescuento.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Para DTE con tributos (03, 05, 06) el IVA no viene por línea,
    // se calcula sobre el totalGravada
    if (usaTributos && totalIva.isZero()) {
        totalIva = totalGravada.mul(IVA_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
        totalIva = totalIva.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const subTotalVentas = totalNoSuj.add(totalExenta).add(totalGravada).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const subTotal = subTotalVentas;
    const tributosResumen = usaTributos ? generarTributosResumen(tipoDte, totalIva.toNumber()) : null;

    // ══════════════════════════════════════════════════════════════
    // NC (05) y ND (06): resumen con estructura propia del schema v3
    // Campos PROHIBIDOS: pagos, numPagoElectronico, saldoFavor,
    //                    totalPagar, totalNoGravado, porcentajeDescuento
    // Campos REQUERIDOS: ivaPerci1, ivaRete1
    // ══════════════════════════════════════════════════════════════
    if (tipoDte === '05' || tipoDte === '06') {
        const montoTotalOperacion = subTotal.add(totalIva).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const resumenNC = {
            totalNoSuj: totalNoSuj.toNumber(),
            totalExenta: totalExenta.toNumber(),
            totalGravada: totalGravada.toNumber(),
            subTotalVentas: subTotalVentas.toNumber(),
            descuNoSuj: 0.00,
            descuExenta: 0.00,
            descuGravada: 0.00,
            totalDescu: 0.00,
            tributos: tributosResumen,
            subTotal: subTotal.toNumber(),
            ivaPerci1: 0.00,
            ivaRete1: 0.00,
            reteRenta: 0.00,
            montoTotalOperacion: montoTotalOperacion.toNumber(),
            totalLetras: numeroALetras(montoTotalOperacion.toNumber()),
            condicionOperacion,
        };
        // ND requiere numPagoElectronico, NC no
        if (tipoDte === '06') {
            resumenNC.numPagoElectronico = null;
        }
        return resumenNC;
    }

    // ══════════════════════════════════════════════════════════════
    // FSE (14): resumen con estructura única
    // ══════════════════════════════════════════════════════════════
    if (tipoDte === '14') {
        const reteRenta = totalGravada.mul(0.10).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const montoTotalOperacion = subTotal.sub(reteRenta).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return {
            totalCompra: totalGravada.toNumber(),
            descu: totalDescuento.toNumber(),
            totalDescu: totalDescuento.toNumber(),
            subTotal: subTotal.toNumber(),
            ivaRete1: 0.00,
            reteRenta: reteRenta.toNumber(),
            totalPagar: montoTotalOperacion.toNumber(),
            totalLetras: numeroALetras(montoTotalOperacion.toNumber()),
            condicionOperacion,
            pagos: undefined, // Se omitirá porque la validación puede fallar si mandamos nulo
            observaciones: null,
        };
    }

    // ══════════════════════════════════════════════════════════════
    // CD (15): resumen único — totalDonado sin IVA
    // ══════════════════════════════════════════════════════════════
    if (tipoDte === '15') {
        const totalDonado = totalGravada;
        return {
            totalDonado: totalDonado.toNumber(),
            totalDescu: totalDescuento.toNumber(),
            observaciones: null,
        };
    }

    // ══════════════════════════════════════════════════════════════
    // NR (04): resumen simplificado (schema v3)
    // PROHIBIDO: condicionOperacion, pagos, numPagoElectronico,
    //            saldoFavor, totalPagar, totalNoGravado, ivaPerci1, ivaRete1, reteRenta
    // ══════════════════════════════════════════════════════════════
    if (tipoDte === '04') {
        const montoTotalOperacion = subTotal.add(totalIva).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return {
            totalNoSuj: totalNoSuj.toNumber(),
            totalExenta: totalExenta.toNumber(),
            totalGravada: totalGravada.toNumber(),
            subTotalVentas: subTotalVentas.toNumber(),
            descuNoSuj: 0.00,
            descuExenta: 0.00,
            descuGravada: 0.00,
            porcentajeDescuento: 0.00,
            totalDescu: 0.00,
            tributos: tributosResumen,
            subTotal: subTotal.toNumber(),
            montoTotalOperacion: montoTotalOperacion.toNumber(),
            totalLetras: numeroALetras(montoTotalOperacion.toNumber()),
        };
    }

    // ══════════════════════════════════════════════════════════════
    // FE-01 / CCF-03 / FEX-11: resumen extendido
    // ══════════════════════════════════════════════════════════════
    let montoTotalOperacion, reteRenta = new Decimal(0);

    if (precioIncluyeIva) {
        // FE (01): ventaGravada YA incluye IVA
        montoTotalOperacion = subTotal;
    } else if (tipoDte === '11') {
        // FEX (11): Exportación sin IVA
        montoTotalOperacion = subTotal;
    } else {
        // CCF-03: subTotal + IVA calculado
        montoTotalOperacion = subTotal.add(totalIva).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const totalPagar = montoTotalOperacion.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // ══════════════════════════════════════════════════════════════
    // PAGOS: Obligatorio como array para FE-01, CCF-03, FEX-11
    // MH RECHAZA pagos: null — debe ser un array con al menos 1 elemento
    // Venta a crédito (condicionOperacion: 2) requiere plazo y periodo
    // ══════════════════════════════════════════════════════════════
    const pagos = generarPagos(condicionOperacion, totalPagar.toNumber(), datosPago);

    // ══════════════════════════════════════════════════════════════
    // ESTRUCTURA DIFERENCIADA: FE-01 vs CCF-03
    // FE-01: incluye totalIva, NO incluye ivaPerci1
    // CCF-03: incluye ivaPerci1, NO incluye totalIva
    // ══════════════════════════════════════════════════════════════
    if (tipoDte === '03') {
        // CCF-03: orden exacto según golden JSON del MH
        return {
            totalNoSuj: totalNoSuj.toNumber(),
            totalExenta: totalExenta.toNumber(),
            totalGravada: totalGravada.toNumber(),
            subTotalVentas: subTotalVentas.toNumber(),
            descuNoSuj: 0.00,
            descuExenta: 0.00,
            descuGravada: 0.00,
            porcentajeDescuento: 0.00,
            totalDescu: 0.00,
            tributos: tributosResumen,
            subTotal: subTotal.toNumber(),
            ivaPerci1: 0.00,
            ivaRete1: 0.00,
            reteRenta: reteRenta.toNumber(),
            montoTotalOperacion: montoTotalOperacion.toNumber(),
            totalNoGravado: 0.00,
            totalPagar: totalPagar.toNumber(),
            totalLetras: numeroALetras(totalPagar.toNumber()),
            saldoFavor: 0.00,
            condicionOperacion,
            pagos,
            numPagoElectronico: null,
        };
    }

    // FE-01 y FEX-11: incluyen totalIva, NO ivaPerci1
    return {
        totalNoSuj: totalNoSuj.toNumber(),
        totalExenta: totalExenta.toNumber(),
        totalGravada: totalGravada.toNumber(),
        subTotalVentas: subTotalVentas.toNumber(),
        descuNoSuj: 0.00,
        descuExenta: 0.00,
        descuGravada: 0.00,
        porcentajeDescuento: 0.00,
        totalDescu: 0.00,
        tributos: tributosResumen,
        subTotal: subTotal.toNumber(),
        ivaRete1: 0.00,
        reteRenta: reteRenta.toNumber(),
        montoTotalOperacion: montoTotalOperacion.toNumber(),
        totalNoGravado: 0.00,
        totalPagar: totalPagar.toNumber(),
        totalLetras: numeroALetras(totalPagar.toNumber()),
        totalIva: totalIva.toNumber(),
        saldoFavor: 0.00,
        condicionOperacion,
        pagos,
        numPagoElectronico: null,
    };
};

/**
 * Genera el array de pagos según condición de operación.
 * MH REQUIERE pagos como array, NUNCA null.
 *
 * @param {number} condicionOperacion - 1=Contado, 2=Crédito, 3=Otro
 * @param {number} montoPago - Monto total a pagar
 * @param {object} datosPago - Datos opcionales {codigo, referencia, plazo, periodo}
 * @returns {Array} Array de objetos de pago
 */
const generarPagos = (condicionOperacion, montoPago, datosPago = {}) => {
    // Validación: Crédito requiere plazo y periodo
    if (condicionOperacion === 2) {
        if (!datosPago.plazo || datosPago.periodo === undefined || datosPago.periodo === null) {
            throw new Error(
                'Venta a crédito (condicionOperacion: 2) requiere plazo y periodo en datosPago. ' +
                'Ejemplo: { plazo: "01", periodo: 30 } donde plazo 01=días, 02=meses'
            );
        }
    }

    return [{
        codigo: datosPago.codigo || '01',   // 01=Efectivo por defecto
        montoPago: montoPago,
        referencia: datosPago.referencia || null,
        plazo: condicionOperacion === 2 ? (datosPago.plazo || null) : null,
        periodo: condicionOperacion === 2 ? (datosPago.periodo || null) : null,
    }];
};

/**
 * Valida que los cálculos cuadren
 */
const validarCuadre = (resumen) => {
    const sumaComponentes = new Decimal(resumen.totalNoSuj || 0)
        .add(resumen.totalExenta || 0)
        .add(resumen.totalGravada || 0)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toNumber();
    const cuadraSubtotal = sumaComponentes === resumen.subTotalVentas;
    const cuadraTotalPagar = resumen.montoTotalOperacion === resumen.totalPagar;

    return {
        valido: cuadraSubtotal && cuadraTotalPagar,
        mensaje: cuadraSubtotal && cuadraTotalPagar
            ? 'Cálculos correctos'
            : `Error: subTotal=${sumaComponentes} vs ${resumen.subTotalVentas}`,
    };
};

/**
 * Convierte número a letras
 */
function numeroALetras(numero) {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const parteEntera = Math.floor(numero);
    const parteDecimal = Math.round((numero - parteEntera) * 100);

    const convertirGrupo = (n) => {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        let resultado = '';
        if (n >= 100) { resultado += centenas[Math.floor(n / 100)] + ' '; n = n % 100; }
        if (n >= 10 && n <= 19) { resultado += especiales[n - 10]; return resultado.trim(); }
        if (n >= 20) { resultado += decenas[Math.floor(n / 10)]; n = n % 10; if (n > 0) resultado += ' Y '; }
        if (n > 0 && n < 10) { resultado += unidades[n]; }
        return resultado.trim();
    };

    let texto = '';
    if (parteEntera === 0) texto = 'CERO';
    else if (parteEntera === 1) texto = 'UN';
    else if (parteEntera < 1000) texto = convertirGrupo(parteEntera);
    else if (parteEntera < 1000000) {
        const miles = Math.floor(parteEntera / 1000);
        const resto = parteEntera % 1000;
        texto = (miles === 1 ? 'MIL' : convertirGrupo(miles) + ' MIL');
        if (resto > 0) texto += ' ' + convertirGrupo(resto);
    } else texto = parteEntera.toString();

    const decimalesStr = parteDecimal.toString().padStart(2, '0');
    return `${texto} ${decimalesStr}/100 USD`;
}

module.exports = {
    TASA_IVA: IVA_RATE,
    redondear,
    calcularLineaProducto,
    calcularResumenFactura,
    validarCuadre,
    numeroALetras,
};
