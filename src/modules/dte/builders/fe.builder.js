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

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

// Umbral MH: Facturas >= $1,095 requieren receptor con documento
const UMBRAL_RECEPTOR_OBLIGATORIO = 1095.00;

/**
 * Construye un documento Factura Electrónica completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, datosPago = {} }) => {
    const tipoDte = '01';

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
    // RECEPTOR FE: Estructura según golden JSON
    // tipoDocumento + numDocumento (NO nit directo)
    // codActividad y descActividad se pasan del request
    // ═══════════════════════════════════════
    const receptorDTE = receptor ? {
        tipoDocumento: receptor.tipoDocumento || null,
        numDocumento: receptor.numDocumento || null,
        nrc: null, // FE no requiere NRC del receptor
        nombre: (receptor.nombre || '').toUpperCase(),
        codActividad: receptor.codActividad || null,
        descActividad: receptor.descActividad || null,
        direccion: (receptor.direccion && receptor.direccion.complemento && receptor.direccion.complemento.trim().length >= 5) ? {
            departamento: receptor.direccion.departamento || '06',
            municipio: receptor.direccion.municipio || '14',
            complemento: receptor.direccion.complemento.toUpperCase(),
        } : null,
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
