/**
 * ========================================
 * BUILDER: NOTA DE DÉBITO (DTE-06) v3
 * Módulo: DTE
 * ========================================
 * Construye documento ND según schema fe-nd-v3.json
 *
 * DIFERENCIAS VS CCF/FE:
 *  - Emisor: SIN codEstableMH, codEstable, codPuntoVentaMH, codPuntoVenta
 *  - Receptor: usa nit/nrc/codActividad (NO tipoDocumento/numDocumento)
 *  - cuerpoDocumento: SIN psv, noGravado — CON numeroDocumento (string requerido)
 *  - resumen: ivaPerci1/ivaRete1, numPagoElectronico (null), SIN totalPagar/pagos/saldoFavor
 *  - root: SIN otrosDocumentos — CON ventaTercero/extension/apendice (null)
 *  - documentoRelacionado.tipoDocumento: solo "03" o "07"
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Nota de Débito completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, documentoRelacionado }) => {
    const tipoDte = '06';

    if (!documentoRelacionado) {
        throw new Error('documentoRelacionado es obligatorio para Nota de Débito (DTE-06)');
    }

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);

    // construirEmisor('06') excluye codEstableMH/codPuntoVentaMH (prohibidos en ND)
    const emisorDTE = construirEmisor(emisor, tipoDte);

    const cuerpoDocumento = procesarItems(items, tipoDte);

    // Para ND, cada ítem necesita numeroDocumento como string válido
    const numDocRef = documentoRelacionado.numeroDocumento;
    cuerpoDocumento.forEach(linea => {
        if (!linea.numeroDocumento || linea.numeroDocumento === 'S/N') {
            linea.numeroDocumento = numDocRef;
        }
    });

    // calcularResumen para '06' devuelve la estructura ND-v3 con numPagoElectronico: null
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    // Root ND-v3: SIN otrosDocumentos (prohibited), CON ventaTercero/extension/apendice (null)
    return {
        identificacion,
        documentoRelacionado: [{
            tipoDocumento: documentoRelacionado.tipoDocumento,   // "03" o "07"
            tipoGeneracion: documentoRelacionado.tipoGeneracion || 2,
            numeroDocumento: documentoRelacionado.numeroDocumento,
            fechaEmision: documentoRelacionado.fechaEmision,
        }],
        emisor: emisorDTE,
        receptor: {
            // ND receptor: igual que NC — usa nit/nrc, NO tipoDocumento/numDocumento
            nit: receptor.nit || receptor.numDocumento,
            nrc: receptor.nrc || null,
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || null,
            descActividad: (receptor.descActividad || '').toUpperCase() || null,
            nombreComercial: receptor.nombreComercial?.toUpperCase() || null,
            direccion: receptor.direccion ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: (receptor.direccion.complemento || '').toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo,
        },
        ventaTercero: null,
        cuerpoDocumento,
        resumen,
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '06',
    nombre: 'Nota de Débito',
};
