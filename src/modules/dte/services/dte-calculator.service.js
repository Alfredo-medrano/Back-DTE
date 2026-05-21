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

    const configDte = obtenerConfigDTE(tipoDte);
    const precioIncluyeIva = configDte ? configDte.precioIncluyeIVA : (tipoDte === '01');
    const usaTributos = configDte ? configDte.usaTributos : false;

    const cantidad = new Decimal(item.cantidad || 0);
    const precioUnitario = new Decimal(item.precioUnitario || item.precioUni || 0);
    const descuento = new Decimal(item.descuento || item.montoDescu || 0);

    const montoBruto = cantidad.mul(precioUnitario);
    const montoNeto = montoBruto.sub(descuento);

    let precioUni, ventaGravada, ivaItem;

    if (precioIncluyeIva) {
        precioUni = precioUnitario;
        ventaGravada = montoNeto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const divisor = new Decimal(1).add(IVA_RATE);
        ivaItem = montoNeto.div(divisor).mul(IVA_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else if (tipoDte === '14' || tipoDte === '11') {
        precioUni = precioUnitario;
        ventaGravada = montoNeto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        ivaItem = new Decimal(0);
    } else {
        precioUni = precioUnitario;
        ventaGravada = montoNeto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        ivaItem = montoNeto.mul(IVA_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
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
        precioUni: precioUni.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        montoDescu: descuento.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
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
 * @returns {object} Resumen formateado según Anexo II
 */
const calcularResumenFactura = (lineas, condicionOperacion = 1, tipoDte = '01') => {
    const configDte = obtenerConfigDTE(tipoDte);
    const precioIncluyeIva = configDte ? configDte.precioIncluyeIVA : (tipoDte === '01');
    const usaTributos = configDte ? configDte.usaTributos : false;

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
    // FE-01 / CCF-03: resumen extendido
    // FEX-11 y FSE-14 también están procesados en sus propios builders o arriba
    // ══════════════════════════════════════════════════════════════
    let montoTotalOperacion, reteRenta = new Decimal(0);

    if (precioIncluyeIva) {
        montoTotalOperacion = subTotal;
    } else if (tipoDte === '11') {
        montoTotalOperacion = subTotal;
    } else {
        // CCF-03: subTotal + IVA calculado
        montoTotalOperacion = subTotal.add(totalIva).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const totalPagar = montoTotalOperacion.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const resumenFinal = {
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
        pagos: null,
        numPagoElectronico: null,
    };
    
    // Percepcion de IVA solo es aplicable/permitida en Credito Fiscal (03)
    if (tipoDte === '03') {
        resumenFinal.ivaPerci1 = 0.00;
    }
    
    return resumenFinal;
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
