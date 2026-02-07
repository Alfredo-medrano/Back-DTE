/**
 * ========================================
 * SERVICIO CALCULADORA DTE
 * Módulo: DTE
 * ========================================
 * Cálculos fiscales según normativa salvadoreña (Anexo II)
 * 
 * Migrado desde: src/utils/calculadorIVA.js
 */

const {
    obtenerConfigDTE,
    generarTributosCuerpo,
    generarTributosResumen,
    IVA_RATE,
} = require('../constants');

const TASA_IVA = IVA_RATE; // 13%

/**
 * Redondea a N decimales (regla fiscal)
 * @param {number} valor - Valor a redondear
 * @param {number} decimales - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
const redondear = (valor, decimales = 2) => {
    const factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
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

    const cantidad = parseFloat(item.cantidad);
    const precioUnitario = parseFloat(item.precioUnitario || item.precioUni);
    const descuento = parseFloat(item.descuento || item.montoDescu || 0);

    const montoBruto = cantidad * precioUnitario;
    const montoNeto = montoBruto - descuento;

    let precioUni, ventaGravada, ivaItem;

    if (precioIncluyeIva) {
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = redondear(montoNeto / (1 + TASA_IVA) * TASA_IVA, 2);
    } else if (tipoDte === '14' || tipoDte === '11') {
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = 0.00;
    } else {
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = redondear(montoNeto * TASA_IVA, 2);
    }

    let uniMedida = 59;
    if (tipoItem === 2) uniMedida = 99;
    if (item.unidadMedida || item.uniMedida) {
        uniMedida = item.unidadMedida || item.uniMedida;
    }

    const tributos = usaTributos ? generarTributosCuerpo(tipoDte) : null;

    return {
        numItem,
        tipoItem,
        numeroDocumento: null,
        cantidad: redondear(cantidad, 8),
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida,
        descripcion: (item.descripcion || '').toUpperCase(),
        precioUni: redondear(precioUni, 2),
        montoDescu: redondear(descuento, 2),
        ventaNoSuj: 0.00,
        ventaExenta: 0.00,
        ventaGravada,
        tributos,
        psv: 0.00,
        noGravado: 0.00,
        ivaItem,
    };
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

    let totalNoSuj = 0, totalExenta = 0, totalGravada = 0, totalDescuento = 0, totalIva = 0;

    lineas.forEach(linea => {
        totalNoSuj += linea.ventaNoSuj || 0;
        totalExenta += linea.ventaExenta || 0;
        totalGravada += linea.ventaGravada || 0;
        totalDescuento += linea.montoDescu || 0;
        totalIva += linea.ivaItem || 0;
    });

    totalNoSuj = redondear(totalNoSuj);
    totalExenta = redondear(totalExenta);
    totalGravada = redondear(totalGravada);
    totalDescuento = redondear(totalDescuento);
    totalIva = redondear(totalIva);

    const subTotalVentas = redondear(totalNoSuj + totalExenta + totalGravada);
    const subTotal = subTotalVentas;

    let montoTotalOperacion, reteRenta = 0.00;

    if (precioIncluyeIva) {
        montoTotalOperacion = subTotal;
    } else if (tipoDte === '14') {
        reteRenta = redondear(totalGravada * 0.10);
        montoTotalOperacion = redondear(subTotal - reteRenta);
    } else if (tipoDte === '11') {
        montoTotalOperacion = subTotal;
    } else {
        montoTotalOperacion = redondear(subTotal + totalIva);
    }

    const totalPagar = redondear(montoTotalOperacion);
    const tributosResumen = usaTributos ? generarTributosResumen(tipoDte, totalIva) : null;

    return {
        totalNoSuj,
        totalExenta,
        totalGravada,
        subTotalVentas,
        descuNoSuj: 0.00,
        descuExenta: 0.00,
        descuGravada: totalDescuento,
        porcentajeDescuento: 0.00,
        totalDescu: totalDescuento,
        tributos: tributosResumen,
        subTotal,
        ivaRete1: 0.00,
        reteRenta,
        montoTotalOperacion,
        totalNoGravado: 0.00,
        totalPagar,
        totalLetras: numeroALetras(totalPagar),
        totalIva,
        saldoFavor: 0.00,
        condicionOperacion,
        pagos: null,
        numPagoElectronico: null,
    };
};

/**
 * Valida que los cálculos cuadren
 */
const validarCuadre = (resumen) => {
    const sumaComponentes = redondear(
        resumen.totalNoSuj + resumen.totalExenta + resumen.totalGravada
    );
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
    TASA_IVA,
    redondear,
    calcularLineaProducto,
    calcularResumenFactura,
    validarCuadre,
    numeroALetras,
};
