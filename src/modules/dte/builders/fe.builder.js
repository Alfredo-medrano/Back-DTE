/**
 * ========================================
 * BUILDER: FACTURA ELECTRÓNICA (DTE-01)
 * Módulo: DTE
 * ========================================
 * Construye documento FE según Anexo II MH
 *
 * REGLAS CRÍTICAS DTE-01:
 * - precioUni INCLUYE IVA
 * - cuerpoDocumento lleva ivaItem, tributos = null
 * - Si montoTotalOperacion >= $1,095 → receptor OBLIGATORIO con DUI/NIT
 * - pagos es SIEMPRE un array (nunca null)
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen, formatDocumentoReceptor, cleanNrc } = require('./base.builder');
const { getFiscalLogic } = require('../constants');

// Umbral MH: Facturas >= $1,095 requieren receptor con documento
const UMBRAL_RECEPTOR_OBLIGATORIO = 1095.00;

/**
 * Construye un documento Factura Electrónica completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, datosPago = {} }) => {
    const tipoDte = '01';
    const logic = getFiscalLogic(tipoDte);

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor);
    const cuerpoDocumento = procesarItems(items, tipoDte);
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte, datosPago);

    // ═══════════════════════════════════════
    // REGLA MH DTE-01: Receptor obligatorio si monto >= $1,095
    // ═══════════════════════════════════════
    if (resumen.montoTotalOperacion >= UMBRAL_RECEPTOR_OBLIGATORIO) {
        if (!receptor || !receptor.numDocumento) {
            throw new Error(
                `DTE-01: Factura con monto $${resumen.montoTotalOperacion} >= $${UMBRAL_RECEPTOR_OBLIGATORIO} ` +
                'requiere receptor con tipoDocumento (13=DUI, 36=NIT) y numDocumento obligatorio.'
            );
        }
    }

    // ═══════════════════════════════════════

    // RECEPTOR FE: Estructura según schema fe-fc-v1.json
    // Campos required: tipoDocumento, numDocumento, nrc, nombre,
    //   codActividad, descActividad, direccion, telefono, correo
    // Regla condicional (allOf):
    //   tipoDocumento === "36" → numDocumento: ^([0-9]{14}|[0-9]{9})$, nrc: ["string","null"]
    //   tipoDocumento !== "36" → nrc DEBE ser null
    //   tipoDocumento === "13" → numDocumento: ^[0-9]{8}-[0-9]{1}$
    // ═══════════════════════════════════════
    const tipoDoc = receptor ? String(receptor.tipoDocumento || '') : '';
    const receptorDTE = receptor ? {
        tipoDocumento: receptor.tipoDocumento || null,
        numDocumento: formatDocumentoReceptor(receptor.tipoDocumento, receptor.numDocumento),
        nrc: tipoDoc === '36' ? cleanNrc(receptor.nrc) : null,
        nombre: (receptor.nombre || '').toUpperCase(),
        codActividad: receptor.codActividad || emisor.codActividad || '10005',
        descActividad: receptor.descActividad || emisor.descActividad || 'OTROS',
        direccion: {
            departamento: (receptor.direccion && receptor.direccion.departamento) || '06',
            municipio: (receptor.direccion && receptor.direccion.municipio) || '14',
            complemento: (receptor.direccion && receptor.direccion.complemento && receptor.direccion.complemento.trim().length >= 5) 
                ? receptor.direccion.complemento.toUpperCase() 
                : 'SIN DIRECCION',
        },
        telefono: receptor.telefono || null,
        correo: receptor.correo || null,
    } : null;

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        receptor: receptorDTE,
        otrosDocumentos: null,
        ventaTercero: null,
        cuerpoDocumento,
        resumen,
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '01',
    nombre: 'Factura Electrónica',
};
