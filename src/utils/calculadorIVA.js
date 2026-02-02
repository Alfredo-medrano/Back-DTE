/**
 * ========================================
 * CALCULADOR DE IVA Y TOTALES
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Cálculos fiscales según normativa salvadoreña (Anexo II)
 * IVA = 13%
 * 
 * IMPORTANTE:
 * - Para Factura Electrónica (FE), el precioUni YA INCLUYE IVA
 * - Para Crédito Fiscal (CCF), el precioUni es SIN IVA
 * - Decimales: 8 para precios/cantidades, 2 para resumen
 */

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
        // Debemos extraer el IVA del total
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
 * @param {object} item - Item del producto
 * @param {number} numItem - Número de línea
 * @param {string} tipoDte - '01' = FE (precio con IVA), '03' = CCF (precio sin IVA)
 * @returns {object} Línea formateada según Anexo II
 */
const calcularLineaProducto = (item, numItem, tipoDte = '01') => {
    const tipoItem = item.tipoItem || 1; // 1=Bienes, 2=Servicios, 3=Ambos, 4=Otros

    // Calcular con precisión
    const cantidad = parseFloat(item.cantidad);
    const precioUni = parseFloat(item.precioUnitario);
    const montoTotal = cantidad * precioUni;
    const descuento = parseFloat(item.descuento || 0);
    const montoNeto = montoTotal - descuento;

    // Para FE (tipoDte 01), el precio incluye IVA
    const precioIncluyeIva = tipoDte === '01';
    const { ventaGravada, ivaItem } = calcularIVALinea(montoNeto, precioIncluyeIva);

    // CRÍTICO: Unidad de medida según tipo de item
    // 59 = Unidad (para bienes)
    // 99 = Servicio (para servicios)
    let uniMedida = 59; // Default para bienes
    if (tipoItem === 2) {
        uniMedida = 99; // Servicios DEBEN usar código 99
    }
    if (item.unidadMedida) {
        uniMedida = item.unidadMedida; // Permitir override manual
    }

    // NORMATIVA MH v2: Para Factura Electrónica (tipoDte 01), tributos debe ser NULL
    // El IVA se calcula implícitamente (precio ya incluye IVA)
    const tributos = null;

    return {
        numItem: numItem,
        tipoItem: tipoItem,
        numeroDocumento: null,
        // NORMATIVA MH: Cuerpo del documento usa HASTA 8 DECIMALES
        cantidad: redondear(cantidad, 8),
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: uniMedida,
        descripcion: item.descripcion.toUpperCase(),
        precioUni: redondear(precioUni, 8),     // 8 decimales según normativa
        montoDescu: redondear(descuento, 8),    // 8 decimales según normativa
        ventaNoSuj: 0.00,
        ventaExenta: 0.00,
        ventaGravada: redondear(ventaGravada, 2), // 2 decimales para montos finales
        tributos: tributos,                       // Array ["20"] para IVA
        psv: 0.00,
        noGravado: 0.00,
        ivaItem: redondear(ivaItem, 2),
    };
};

/**
 * Calcula el resumen completo de una factura según Anexo II
 * @param {Array} lineas - Array de líneas del cuerpoDocumento (ya procesadas)
 * @param {number} condicionOperacion - 1=Contado, 2=Crédito, 3=Otro
 * @returns {object} Resumen formateado según Anexo II
 */
const calcularResumenFactura = (lineas, condicionOperacion = 1) => {
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

    // IMPORTANTE: Para Factura Electrónica (FE), el precio ya incluye IVA
    // Por lo tanto: montoTotalOperacion = subTotal + IVA (que es el monto original del cliente)
    // Esto equivale a: ventaGravada + IVA = precio original
    const montoTotalOperacion = redondear(subTotal + totalIva);
    const totalPagar = redondear(montoTotalOperacion);

    // NORMATIVA MH v2: Para Factura Electrónica (tipoDte 01), tributos debe ser NULL
    // El IVA se maneja implícitamente con el campo totalIva

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
        tributos: null,              // NULL para Factura Electrónica v2
        subTotal: subTotal,
        totalIva: totalIva,           // REQUERIDO en v2
        ivaRete1: 0.00,
        reteRenta: 0.00,
        montoTotalOperacion: montoTotalOperacion,
        totalNoGravado: 0.00,
        totalPagar: totalPagar,
        totalLetras: numeroALetras(totalPagar),
        saldoFavor: 0.00,
        condicionOperacion: condicionOperacion,
        pagos: null,                 // null para condición Contado
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
        texto = parteEntera.toString(); // Para números muy grandes
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
