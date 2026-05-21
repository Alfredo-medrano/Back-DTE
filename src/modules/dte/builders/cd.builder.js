/**
 * ========================================
 * BUILDER: COMPROBANTE DE DONACIÓN (DTE-15) v1
 * Módulo: DTE
 * ========================================
 * Construye documento CD según Anexo II MH (schema fe-cd-v1.json)
 *
 * ESTRUCTURA MUY DIFERENTE AL RESTO:
 *  - El emisor del sistema es el "donatario" (quien emite el comprobante de donación)
 *  - El "receptor/cliente" es el "donante" (quien realizó la donación)
 *  - cuerpoDocumento usa campo "donacion" (monto donado) en lugar de ventaGravada/ivaItem
 *  - Sin IVA — las donaciones están exentas
 *  - Resumen: totalDonado, sin IVA
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye el bloque "donatario" (emisor) para el CD
 * Usa la misma lógica que el emisor base — el schema CD requiere los mismos campos
 * @param {object} emisor - Datos del emisor/donatario
 * @returns {object} Bloque donatario según schema fe-cd-v1.json
 */
const construirDonatario = (emisor) => {
    const base = construirEmisor(emisor, '15');
    // CD: El donatario necesita tipoDocumento y numDocumento (NIT = tipo 36)
    const nitHacienda = emisor.nit;
    return {
        tipoDocumento: '36',
        numDocumento: nitHacienda,
        nrc: emisor.nrc || null,
        nombre: (emisor.nombre || '').toUpperCase(),
        codActividad: emisor.codActividad,
        descActividad: (emisor.descActividad || '').toUpperCase(),
        nombreComercial: emisor.nombreComercial?.toUpperCase() || null,
        tipoEstablecimiento: emisor.tipoEstablecimiento || '01',
        direccion: {
            departamento: emisor.departamento || '06',
            municipio: emisor.municipio || '14',
            complemento: (emisor.complemento || '').toUpperCase(),
        },
        telefono: emisor.telefono,
        correo: emisor.correo,
        codEstableMH: base.codEstableMH || null,
        codEstable: base.codEstable || null,
        codPuntoVentaMH: base.codPuntoVentaMH || null,
        codPuntoVenta: base.codPuntoVenta || null,
    };
};

/**
 * Construye el bloque "donante" (receptor) para el CD
 * El donante puede ser anónimo (todos los campos son opcionales/null)
 * tipoDocumento acepta: 36 (NIT), 13 (DUI), 02 (Carné de extranjero), 03 (Pasaporte), 37 (Otro)
 * @param {object|null} receptor - Datos del donante
 * @returns {object} Bloque donante según schema fe-cd-v1.json
 */
const construirDonante = (receptor) => {
    if (!receptor) {
        // Donante anónimo — el schema permite null/empty para la mayoría de campos
        return {
            tipoDocumento: '37',
            numDocumento: 'ANON',
            nrc: null,
            nombre: 'DONANTE ANÓNIMO',
            codActividad: null,
            descActividad: null,
            direccion: null,
            telefono: null,
            correo: null,
            codDomiciliado: 1,
            codPais: '9320', // El Salvador por defecto
        };
    }

    return {
        tipoDocumento: receptor.tipoDocumento || '37',
        numDocumento: receptor.numDocumento || 'ANON',
        nrc: receptor.nrc || null,
        nombre: (receptor.nombre || 'DONANTE ANÓNIMO').toUpperCase(),
        codActividad: receptor.codActividad || null,
        descActividad: receptor.descActividad ? receptor.descActividad.toUpperCase() : null,
        direccion: receptor.direccion && receptor.direccion.complemento ? {
            departamento: receptor.direccion.departamento || '06',
            municipio: receptor.direccion.municipio || '14',
            complemento: (receptor.direccion.complemento || '').toUpperCase(),
        } : null,
        telefono: receptor.telefono || null,
        correo: receptor.correo || null,
        codDomiciliado: receptor.codDomiciliado || 1, // 1=Nacional, 2=Extranjero
        codPais: receptor.codPais || '9320', // 9320 = El Salvador
    };
};

/**
 * Procesa items de donación
 * Cada ítem tiene campo "donacion" (monto) en lugar de ventaGravada/ivaItem
 * @param {Array} items - Items del request
 * @returns {Array} cuerpoDocumento según schema CD
 */
const procesarItemsCD = (items) => {
    return items.map((item, index) => {
        const cantidad = parseFloat(item.cantidad || 1);
        const precioUnitario = parseFloat(item.precioUnitario || item.precioUni || 0);
        const descuento = parseFloat(item.descuento || item.montoDescu || 0);
        const donacion = Math.round((cantidad * precioUnitario - descuento) * 100) / 100;

        return {
            numItem: index + 1,
            cantidad: Math.round(cantidad * 100000000) / 100000000,
            codigo: item.codigo || null,
            uniMedida: item.uniMedida || item.unidadMedida || 99,
            descripcion: (item.descripcion || '').toUpperCase(),
            precioUni: Math.round(precioUnitario * 100) / 100,
            montoDescu: Math.round(descuento * 100) / 100,
            donacion,
        };
    });
};

/**
 * Calcula el resumen del Comprobante de Donación
 * Sin IVA — donaciones están exentas
 * @param {Array} cuerpoDocumento - Líneas procesadas
 * @param {object} datos - Datos adicionales (opcional)
 * @returns {object} Resumen según schema CD
 */
const calcularResumenCD = (cuerpoDocumento, datos = {}) => {
    let totalDonado = 0;
    let totalDescuento = 0;

    cuerpoDocumento.forEach(linea => {
        totalDonado += linea.donacion || 0;
        totalDescuento += linea.montoDescu || 0;
    });

    totalDonado = Math.round(totalDonado * 100) / 100;
    totalDescuento = Math.round(totalDescuento * 100) / 100;

    const entero = Math.floor(totalDonado);
    const centavos = Math.round((totalDonado - entero) * 100);
    const centavosStr = String(centavos).padStart(2, '0');

    // Número a letras básico para el CD
    const totalLetras = `${totalDonado.toFixed(2)} USD`;

    return {
        totalDonado,
        totalDescu: totalDescuento,
        observaciones: datos.observaciones || null,
    };
};

/**
 * Construye un documento Comprobante de Donación completo
 * @param {object} params - Parámetros del documento
 * El orquestador pasa: emisor, receptor, items, correlativo, condicionOperacion,
 *                      documentoRelacionado, datosExportacion, observaciones
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, observaciones }) => {
    const tipoDte = '15';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);

    // CD: NO incluye tipoContingencia ni motivoContin (schema additionalProperties: false)
    delete identificacion.tipoContingencia;
    delete identificacion.motivoContin;

    const donatario = construirDonatario(emisor);
    const donante = construirDonante(receptor);
    const cuerpoDocumento = procesarItemsCD(items);
    const resumen = calcularResumenCD(cuerpoDocumento, { observaciones });

    return {
        identificacion,
        donatario,
        donante,
        otrosDocumentos: null,
        cuerpoDocumento,
        resumen,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '15',
    nombre: 'Comprobante de Donación',
};
