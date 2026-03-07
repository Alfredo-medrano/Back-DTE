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
    const emisorDTE = construirEmisor(emisor, tipoDte);
    const cuerpoDocumento = procesarItems(items, tipoDte).map(item => {
        // FSE schema prohíbe explícitamente codTributo y numeroDocumento
        delete item.codTributo;
        delete item.numeroDocumento;
        // tipoItem permitido: 1, 2, 3. Si el front envía 4, mapear a 2 (servicios)
        if (item.tipoItem && ![1, 2, 3].includes(item.tipoItem)) {
            item.tipoItem = 2;
        }
        return item;
    });
    const resumen = calcularResumen(cuerpoDocumento, condicionOperacion, tipoDte);

    // FSE exige el array "pagos" en el resumen. Si el front no lo envía, agregamos un default:
    if (!resumen.pagos) {
        resumen.pagos = [
            {
                codigo: "01", // 01 = Billetes y monedas
                montoPago: resumen.totalPagar,
                referencia: null,
                plazo: null,
                periodo: null
            }
        ];
    }

    return {
        identificacion,
        emisor: emisorDTE,
        sujetoExcluido: {
            tipoDocumento: receptor.tipoDocumento || '13', // 13 = DUI
            // Si es DUI (13), el schema exige exactamente 9 dígitos. Quitamos guiones si los trae.
            numDocumento: (receptor.tipoDocumento === '13' || !receptor.tipoDocumento)
                ? (receptor.numDocumento || '').replace(/\D/g, '')
                : receptor.numDocumento,
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
        apendice: null,
    };
};

module.exports = {
    construir,
    tipoDte: '14',
    nombre: 'Factura Sujeto Excluido',
};
