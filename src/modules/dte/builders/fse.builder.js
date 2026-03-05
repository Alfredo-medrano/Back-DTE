/**
 * ========================================
 * BUILDER: FACTURA SUJETO EXCLUIDO (DTE-14)
 * Módulo: DTE
 * ========================================
 * Construye documento FSE según Anexo II MH
 * DIFERENCIA: Receptor es persona natural sin obligaciones tributarias
 * No lleva IVA (tipoItem = 4 para servicios o 1 para bienes)
 */

const { construirIdentificacion, construirEmisor, procesarItems, calcularResumen } = require('./base.builder');

/**
 * Construye un documento Factura Sujeto Excluido completo
 * @param {object} params - Parámetros del documento
 */
const construir = ({ emisor, receptor, items, correlativo, condicionOperacion = 1 }) => {
    const tipoDte = '14';

    const identificacion = construirIdentificacion(tipoDte, emisor, correlativo);
    const emisorDTE = construirEmisor(emisor);
    const cuerpoDocumento = procesarItems(items, tipoDte);
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    return {
        identificacion,
        documentoRelacionado: null,
        emisor: emisorDTE,
        // FSE: El receptor es un Sujeto Excluido —
        // persona natural que no es contribuyente del IVA
        receptor: {
            tipoDocumento: receptor.tipoDocumento || '13', // 13 = DUI
            numDocumento: receptor.numDocumento,
            nombre: (receptor.nombre || '').toUpperCase(),
            codActividad: receptor.codActividad || null,
            descActividad: receptor.descActividad?.toUpperCase() || null,
            direccion: receptor.direccion ? {
                departamento: receptor.direccion.departamento || '06',
                municipio: receptor.direccion.municipio || '14',
                complemento: (receptor.direccion.complemento || '').toUpperCase(),
            } : null,
            telefono: receptor.telefono || null,
            correo: receptor.correo || null,
        },
        cuerpoDocumento,
        resumen,
        extension: null,
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '14',
    nombre: 'Factura Sujeto Excluido',
};
