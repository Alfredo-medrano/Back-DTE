/**
 * ========================================
 * BUILDER: NOTA DE CRÉDITO (DTE-05) v3
 * Módulo: DTE
 * ========================================
 * Construye documento NC según schema fe-nc-v3.json
 *
 * DIFERENCIAS VS CCF/FE:
 *  - Emisor: SIN codEstableMH, codEstable, codPuntoVentaMH, codPuntoVenta
 *  - Receptor: usa nit/nrc/codActividad (NO tipoDocumento/numDocumento)
 *  - cuerpoDocumento: SIN psv, noGravado — CON numeroDocumento (string requerido)
 *  - resumen: ivaPerci1/ivaRete1, SIN totalPagar/pagos/saldoFavor
 *  - root: SIN otrosDocumentos — CON ventaTercero/extension/apendice (null)
 *  - documentoRelacionado.tipoDocumento: solo "03" o "07"
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Nota de Crédito completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1, documentoRelacionado }) => {
    const tipoDte = '05';

    if (!documentoRelacionado) {
        throw new Error('documentoRelacionado es obligatorio para Nota de Crédito (DTE-05)');
    }

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);

    // construirEmisor('05') excluye codEstableMH/codPuntoVentaMH (prohibidos en NC)
    const emisorDTE = construirEmisor(emisor, tipoDte);

    const cuerpoDocumento = procesarItems(items, tipoDte);

    // Para NC, cada ítem necesita numeroDocumento como string válido
    // Se usa el numeroDocumento del documentoRelacionado como referencia por defecto
    const numDocRef = documentoRelacionado.numeroDocumento;
    cuerpoDocumento.forEach(linea => {
        if (!linea.numeroDocumento || linea.numeroDocumento === 'S/N') {
            linea.numeroDocumento = numDocRef;
        }
    });

    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    // Root NC-v3: SIN otrosDocumentos (prohibited), CON ventaTercero/extension/apendice (null)
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
            // NC receptor: igual que CCF — usa nit/nrc, NO tipoDocumento/numDocumento
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
        // ventaTercero, extension, apendice son requeridos en el schema (null = válido)
        ventaTercero: null,
        cuerpoDocumento,
        resumen,
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '05',
    nombre: 'Nota de Crédito',
};
