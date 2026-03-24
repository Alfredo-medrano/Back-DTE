/**
 * ========================================
 * BUILDER: NOTA DE REMISIÓN (DTE-04)
 * Módulo: DTE
 * ========================================
 * Construye documento NR según Anexo II MH (schema v3)
 *
 * DIFERENCIAS CLAVE:
 * - Receptor tiene campo `bienTitulo` (único de NR)
 * - Usa tributos (IVA separado, igual que CCF-03)
 * - Emisor con codEstableMH/codPuntoVentaMH
 * - Resumen simplificado (sin pagos, sin condicionOperacion)
 * - Puede tener documentoRelacionado (FE-01 o CCF-03)
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Nota de Remisión completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, documentoRelacionado = null }) => {
    const tipoDte = '04';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor, tipoDte);
    const cuerpoDocumento = procesarItems(items, tipoDte);

    // NR requiere tributos en cada línea que tenga ventaGravada > 0
    // Esto ya lo maneja procesarItems via dte-calculator + constants (usaTributos: true)

    // Resumen NR: estructura simplificada según fe-nr-v3.json
    const resumenBase = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    // Documentos relacionados (puede referenciar FE-01 o CCF-03)
    let docRelacionado = null;
    if (documentoRelacionado) {
        docRelacionado = Array.isArray(documentoRelacionado)
            ? documentoRelacionado
            : [documentoRelacionado];

        docRelacionado = docRelacionado.map(doc => ({
            tipoDocumento: doc.tipoDocumento || '01',
            tipoGeneracion: doc.tipoGeneracion || 2,
            numeroDocumento: doc.numeroDocumento,
            fechaEmision: doc.fechaEmision,
        }));
    }

    return {
        identificacion,
        documentoRelacionado: docRelacionado,
        emisor: emisorDTE,
        receptor: {
            tipoDocumento: receptor.tipoDocumento || '36',
            numDocumento: receptor.numDocumento,
            nrc: receptor.nrc || null,
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || null,
            descActividad: receptor.descActividad ? receptor.descActividad.toUpperCase() : null,
            nombreComercial: receptor.nombreComercial?.toUpperCase() || null,
            direccion: receptor.direccion ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: (receptor.direccion.complemento || '').toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo,
            bienTitulo: receptor.bienTitulo || '02', // 01=Consignación, 02=Otro
        },
        ventaTercero: null,
        cuerpoDocumento,
        resumen: {
            totalNoSuj: resumenBase.totalNoSuj,
            totalExenta: resumenBase.totalExenta,
            totalGravada: resumenBase.totalGravada,
            subTotalVentas: resumenBase.subTotalVentas,
            descuNoSuj: resumenBase.descuNoSuj || 0.00,
            descuExenta: resumenBase.descuExenta || 0.00,
            descuGravada: resumenBase.descuGravada || 0.00,
            porcentajeDescuento: resumenBase.porcentajeDescuento || 0.00,
            totalDescu: resumenBase.totalDescu,
            tributos: resumenBase.tributos,
            subTotal: resumenBase.subTotal,
            montoTotalOperacion: resumenBase.montoTotalOperacion,
            totalLetras: resumenBase.totalLetras,
        },
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '04',
    nombre: 'Nota de Remisión',
};
