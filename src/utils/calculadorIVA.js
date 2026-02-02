/**
 * ========================================
 * CALCULADOR DE IVA Y TOTALES
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Cálculos fiscales según normativa salvadoreña (Anexo II)
 * IVA = 13%
 * 
 * IMPORTANTE - DIFERENCIAS POR VERSIÓN:
 * - FE (01) v1: precioUni INCLUYE IVA, tributos = null
 * - CCF (03) v3: precioUni SIN IVA, tributos = ["20"]
 * - NC (05) v3: Similar a CCF, requiere documentoRelacionado
 * - ND (06) v3: Similar a CCF, requiere documentoRelacionado
 * - FSE (14) v1: Sin IVA, usa sujetoExcluido, aplica retención
 * - FEX (11) v1: Exportación sin IVA
 * 
 * Decimales: 8 para precios/cantidades, 2 para resumen
 */

const {
    obtenerConfigDTE,
    generarTributosCuerpo,
    generarTributosResumen,
} = require('../config/tiposDTE');

const TASA_IVA = 0.13; // 13% IVA El Salvador

/**
 * Redondea a N decimales (regla fiscal: si 3er decimal >= 5, redondea arriba)
 * @param {number} valor - Valor a redondear
 * @param {number} decimales - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
const redondear = (valor, decimales = 2) => {
    const factor = Math.pow(10, decimales);
    return Math.round(valor * factor) / factor;
};

/**
 * Redondea a 8 decimales (para precios unitarios y cantidades)
 * @param {number} valor - Valor a redondear
 * @returns {number} Valor con hasta 8 decimales
 */
const redondear8 = (valor) => {
    return redondear(valor, 8);
};

/**
 * Calcula el IVA basado en el tipo de documento
 * @param {number} montoTotal - Monto de la línea (cantidad * precioUnitario)
 * @param {boolean} precioIncluyeIva - true para FE (precio con IVA), false para CCF
 * @returns {object} { ventaGravada, ivaItem, precioConIva }
 */
const calcularIVALinea = (montoTotal, precioIncluyeIva = true) => {
    let ventaGravada, ivaItem, precioConIva;

    if (precioIncluyeIva) {
        // FACTURA ELECTRÓNICA (FE): El precio YA incluye IVA
        precioConIva = redondear(montoTotal);
        ventaGravada = redondear(montoTotal / (1 + TASA_IVA));
        ivaItem = redondear(precioConIva - ventaGravada);
    } else {
        // CRÉDITO FISCAL (CCF): El precio es SIN IVA
        ventaGravada = redondear(montoTotal);
        ivaItem = redondear(montoTotal * TASA_IVA);
        precioConIva = redondear(ventaGravada + ivaItem);
    }

    return { ventaGravada, ivaItem, precioConIva };
};

/**
 * Calcula una línea de producto para el cuerpoDocumento
 * SOPORTA TODOS LOS TIPOS DE DTE según versión:
 * - v1 (01, 11, 14, 15): tributos = null
 * - v3 (03, 05, 06): tributos = ["20"]
 * 
 * @param {object} item - Item del producto
 * @param {number} numItem - Número de línea
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {object} Línea formateada según Anexo II
 */
const calcularLineaProducto = (item, numItem, tipoDte = '01') => {
    const tipoItem = item.tipoItem || 1; // 1=Bienes, 2=Servicios, 3=Ambos, 4=Otros

    // Obtener configuración del tipo de DTE
    const configDte = obtenerConfigDTE(tipoDte);
    const precioIncluyeIva = configDte ? configDte.precioIncluyeIVA : (tipoDte === '01');
    const usaTributos = configDte ? configDte.usaTributos : false;

    // Calcular con precisión
    const cantidad = parseFloat(item.cantidad);
    const precioUnitario = parseFloat(item.precioUnitario || item.precioUni);
    const descuento = parseFloat(item.descuento || item.montoDescu || 0);

    // Monto bruto antes de descuento
    const montoBruto = cantidad * precioUnitario;
    // Monto neto después de descuento
    const montoNeto = montoBruto - descuento;

    let precioUni, ventaGravada, ivaItem;

    // ========================================
    // LÓGICA DIFERENCIADA POR TIPO DE DTE
    // ========================================
    if (precioIncluyeIva) {
        // === FACTURA (01): Precio YA INCLUYE IVA ===
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        // Extraer IVA del precio (informativo)
        ivaItem = redondear(montoNeto / (1 + TASA_IVA) * TASA_IVA, 2);
    } else if (tipoDte === '14') {
        // === SUJETO EXCLUIDO (14): SIN IVA ===
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = 0.00;
    } else if (tipoDte === '11') {
        // === EXPORTACIÓN (11): SIN IVA ===
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = 0.00;
    } else {
        // === CCF (03), NC (05), ND (06): Precio NETO + IVA ===
        precioUni = precioUnitario;
        ventaGravada = redondear(montoNeto, 2);
        ivaItem = redondear(montoNeto * TASA_IVA, 2);
    }

    // CRÍTICO: Unidad de medida según tipo de item
    let uniMedida = 59; // Default para bienes
    if (tipoItem === 2) {
        uniMedida = 99; // Servicios DEBEN usar código 99
    }
    if (item.unidadMedida || item.uniMedida) {
        uniMedida = item.unidadMedida || item.uniMedida;
    }

    // TRIBUTOS: v1=null, v3=["20"]
    const tributos = usaTributos ? generarTributosCuerpo(tipoDte) : null;

    return {
        numItem: numItem,
        tipoItem: tipoItem,
        numeroDocumento: null,
        cantidad: redondear(cantidad, 8),
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: uniMedida,
        descripcion: (item.descripcion || '').toUpperCase(),
        precioUni: redondear(precioUni, 2),
        montoDescu: redondear(descuento, 2),
        ventaNoSuj: 0.00,
        ventaExenta: 0.00,
        ventaGravada: ventaGravada,
        tributos: tributos,
        psv: 0.00,
        noGravado: 0.00,
        ivaItem: ivaItem,
    };
};

/**
 * Calcula el resumen completo de una factura según Anexo II
 * SOPORTA TODOS LOS TIPOS DE DTE según versión:
 * - v1 (01): tributos = null
 * - v3 (03, 05, 06): tributos = [{codigo, descripcion, valor}]
 * - FSE (14): incluye retención renta
 * 
 * @param {Array} lineas - Array de líneas del cuerpoDocumento
 * @param {number} condicionOperacion - 1=Contado, 2=Crédito, 3=Otro
 * @param {string} tipoDte - Código del tipo de DTE
 * @returns {object} Resumen formateado según Anexo II
 */
const calcularResumenFactura = (lineas, condicionOperacion = 1, tipoDte = '01') => {
    // Obtener configuración del tipo de DTE
    const configDte = obtenerConfigDTE(tipoDte);
    const precioIncluyeIva = configDte ? configDte.precioIncluyeIVA : (tipoDte === '01');
    const usaTributos = configDte ? configDte.usaTributos : false;

    let totalNoSuj = 0;
    let totalExenta = 0;
    let totalGravada = 0;
    let totalDescuento = 0;
    let totalIva = 0;

    lineas.forEach(linea => {
        totalNoSuj += linea.ventaNoSuj || 0;
        totalExenta += linea.ventaExenta || 0;
        totalGravada += linea.ventaGravada || 0;
        totalDescuento += linea.montoDescu || 0;
        totalIva += linea.ivaItem || 0;
    });

    // NORMATIVA MH: Resumen usa EXACTAMENTE 2 decimales
    totalNoSuj = redondear(totalNoSuj);
    totalExenta = redondear(totalExenta);
    totalGravada = redondear(totalGravada);
    totalDescuento = redondear(totalDescuento);
    totalIva = redondear(totalIva);

    const subTotalVentas = redondear(totalNoSuj + totalExenta + totalGravada);
    const subTotal = subTotalVentas;

    // ========================================
    // LÓGICA DE CÁLCULO POR TIPO DE DTE
    // ========================================
    let montoTotalOperacion;
    let reteRenta = 0.00;

    if (precioIncluyeIva) {
        // FE (01): ventaGravada YA incluye IVA
        montoTotalOperacion = subTotal;
    } else if (tipoDte === '14') {
        // FSE (14): Sin IVA, con retención renta 10%
        reteRenta = redondear(totalGravada * 0.10);
        montoTotalOperacion = redondear(subTotal - reteRenta);
    } else if (tipoDte === '11') {
        // FEX (11): Exportación sin IVA
        montoTotalOperacion = subTotal;
    } else {
        // CCF (03), NC (05), ND (06): Sumar IVA
        montoTotalOperacion = redondear(subTotal + totalIva);
    }

    const totalPagar = redondear(montoTotalOperacion);

    // TRIBUTOS: v1=null, v3=[{codigo, descripcion, valor}]
    const tributosResumen = usaTributos ? generarTributosResumen(tipoDte, totalIva) : null;

    return {
        totalNoSuj: totalNoSuj,
        totalExenta: totalExenta,
        totalGravada: totalGravada,
        subTotalVentas: subTotalVentas,
        descuNoSuj: 0.00,
        descuExenta: 0.00,
        descuGravada: totalDescuento,
        porcentajeDescuento: 0.00,
        totalDescu: totalDescuento,
        tributos: tributosResumen,        // null o [{codigo, descripcion, valor}]
        subTotal: subTotal,
        ivaRete1: 0.00,
        reteRenta: reteRenta,             // Para FSE
        montoTotalOperacion: montoTotalOperacion,
        totalNoGravado: 0.00,
        totalPagar: totalPagar,
        totalLetras: numeroALetras(totalPagar),
        totalIva: totalIva,
        saldoFavor: 0.00,
        condicionOperacion: condicionOperacion,
        pagos: null,
        numPagoElectronico: null,
    };
};

/**
 * Valida que los cálculos cuadren matemáticamente
 * @param {object} resumen - Objeto de resumen
 * @returns {object} { valido: boolean, mensaje: string }
 */
const validarCuadre = (resumen) => {
    const sumaComponentes = redondear(
        resumen.totalNoSuj +
        resumen.totalExenta +
        resumen.totalGravada
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
 * Convierte número a letras (formato: "VEINTE 00/100 USD")
 * @param {number} numero - Monto a convertir
 * @returns {string} Monto en letras
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

        if (n >= 100) {
            resultado += centenas[Math.floor(n / 100)] + ' ';
            n = n % 100;
        }

        if (n >= 10 && n <= 19) {
            resultado += especiales[n - 10];
            return resultado.trim();
        }

        if (n >= 20) {
            resultado += decenas[Math.floor(n / 10)];
            n = n % 10;
            if (n > 0) resultado += ' Y ';
        }

        if (n > 0 && n < 10) {
            resultado += unidades[n];
        }

        return resultado.trim();
    };

    let texto = '';

    if (parteEntera === 0) {
        texto = 'CERO';
    } else if (parteEntera === 1) {
        texto = 'UN';
    } else if (parteEntera < 1000) {
        texto = convertirGrupo(parteEntera);
    } else if (parteEntera < 1000000) {
        const miles = Math.floor(parteEntera / 1000);
        const resto = parteEntera % 1000;
        texto = (miles === 1 ? 'MIL' : convertirGrupo(miles) + ' MIL');
        if (resto > 0) texto += ' ' + convertirGrupo(resto);
    } else {
        texto = parteEntera.toString();
    }

    const decimalesStr = parteDecimal.toString().padStart(2, '0');
    return `${texto} ${decimalesStr}/100 USD`;
}

module.exports = {
    TASA_IVA,
    redondear,
    redondear8,
    calcularIVALinea,
    calcularLineaProducto,
    calcularResumenFactura,
    validarCuadre,
    numeroALetras,
};
