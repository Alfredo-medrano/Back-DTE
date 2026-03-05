/**
 * ========================================
 * BUILDER: NOTA DE DÉBITO (DTE-06)
 * Módulo: DTE
 * ========================================
 * Construye documento ND según Anexo II MH
 * REQUIERE: documentoRelacionado obligatorio
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
    const emisorDTE = construirEmisor(emisor);
    const cuerpoDocumento = procesarItems(items, tipoDte);
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    return {
        identificacion,
        // OBLIGATORIO para ND
        documentoRelacionado: [{
            tipoDocumento: documentoRelacionado.tipoDocumento,
            tipoGeneracion: documentoRelacionado.tipoGeneracion || 1,
            numeroDocumento: documentoRelacionado.numeroDocumento,
            fechaEmision: documentoRelacionado.fechaEmision,
        }],
        emisor: emisorDTE,
        receptor: {
            tipoDocumento: receptor.tipoDocumento || '36',
            numDocumento: receptor.numDocumento,
            nrc: receptor.nrc || null,
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || null,
            descActividad: receptor.descActividad?.toUpperCase() || null,
            direccion: receptor.direccion ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: (receptor.direccion.complemento || '').toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo,
        },
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
    tipoDte: '06',
    nombre: 'Nota de Débito',
};
