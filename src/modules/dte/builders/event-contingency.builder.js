/**
 * ========================================
 * BUILDER: EVENTO DE CONTINGENCIA (v3)
 * Módulo: DTE
 * ========================================
 * Construye el JSON del Evento de Contingencia según contingencia-schema-v3.json
 */

const { generarCodigoGeneracion, generarTimestampEmision } = require('../../../shared/utils');

/**
 * Construye el JSON del Evento de Contingencia
 * 
 * @param {object} params
 * @param {object} params.emisor - Datos del emisor
 * @param {string} params.fInicio - Fecha inicio de contingencia (YYYY-MM-DD)
 * @param {string} params.hInicio - Hora inicio de contingencia (HH:MM:SS)
 * @param {string} params.fFin - Fecha fin de contingencia (YYYY-MM-DD)
 * @param {string} params.hFin - Hora fin de contingencia (HH:MM:SS)
 * @param {number} params.tipoContingencia - Tipo de contingencia (1 a 5)
 * @param {string} params.motivoContingencia - Descripción detallada
 * @param {Array<object>} params.dtes - Lista de DTEs { codigoGeneracion, tipoDte }
 * @returns {object} JSON del Evento de Contingencia listo para firmar
 */
const construir = ({
    emisor,
    fInicio,
    hInicio,
    fFin,
    hFin,
    tipoContingencia,
    motivoContingencia,
    dtes
}) => {
    const { fecha: fTransmision, hora: hTransmision } = generarTimestampEmision();

    const codigoGeneracion = generarCodigoGeneracion();

    // Detalle de DTEs
    const detalleDTE = dtes.map((dte, idx) => ({
        noItem: idx + 1,
        codigoGeneracion: dte.codigoGeneracion,
        tipoDoc: dte.tipoDte
    }));

    return {
        identificacion: {
            version: 3,
            ambiente: emisor.ambiente || '00',
            codigoGeneracion,
            fTransmision,
            hTransmision
        },
        emisor: {
            nit: emisor.nit.replace(/[^0-9]/g, ''),
            nombre: emisor.nombre.toUpperCase(),
            nombreResponsable: emisor.nombre.toUpperCase(), // Por defecto, el nombre del emisor
            tipoDocResponsable: '36', // NIT por defecto
            numeroDocResponsable: emisor.nit.replace(/[^0-9]/g, ''),
            tipoEstablecimiento: emisor.tipoEstablecimiento || '01',
            codEstableMH: emisor.codEstableMH || null,
            codPuntoVenta: emisor.codPuntoVentaMH || null, // Nota: el schema exige codPuntoVenta, no codPuntoVentaMH
            telefono: emisor.telefono || '22000000',
            correo: emisor.correo
        },
        detalleDTE,
        motivo: {
            fInicio,
            fFin,
            hInicio,
            hFin,
            tipoContingencia: parseInt(tipoContingencia, 10),
            motivoContingencia: motivoContingencia || 'NO DISPONIBILIDAD DE SISTEMA DEL MH'
        }
    };
};

module.exports = {
    construir,
    nombre: 'Evento de Contingencia',
};
