/**
 * ========================================
 * CONTROLADOR DTE
 * Módulo: DTE
 * ========================================
 * Maneja las peticiones HTTP para operaciones DTE
 * Responsabilidad: req/res (Vista en MVC para APIs)
 */

const { dteOrchestrator } = require('../services');
const { signer, mhSender } = require('../services');
const { BadRequestError } = require('../../../shared/errors');
const config = require('../../../config/env');
const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');

/**
 * Crear una nueva factura electrónica (flujo completo)
 * POST /api/dte/facturar
 */
const crearFactura = async (req, res, next) => {
    try {
        const { emisor, receptor, items, tipoDte, correlativo, condicionOperacion } = req.body;

        // Validación
        if (!emisor || !receptor || !items || !Array.isArray(items) || items.length === 0) {
            throw new BadRequestError('Datos incompletos', 'DATOS_INCOMPLETOS');
        }

        console.log('📄 Iniciando creación de factura electrónica...');

        const resultado = await dteOrchestrator.procesarFactura({
            emisor,
            receptor,
            items,
            tipoDte,
            correlativo,
            condicionOperacion,
        });

        if (resultado.exito) {
            res.json({
                exito: true,
                mensaje: 'Factura procesada exitosamente por el Ministerio de Hacienda',
                datos: resultado.datos,
                documento: resultado.documento,
                documentoFirmado: resultado.documentoFirmado,
            });
        } else {
            res.status(400).json({
                exito: false,
                mensaje: 'Factura rechazada por Hacienda',
                error: resultado.error,
                observaciones: resultado.observaciones,
                documento: resultado.documento,
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Transmitir documento DTE directo (JSON Anexo II ya armado)
 * POST /api/dte/transmitir
 */
const transmitirDirecto = async (req, res, next) => {
    try {
        const documentoDTE = req.body;

        if (!documentoDTE.identificacion || !documentoDTE.emisor || !documentoDTE.receptor || !documentoDTE.cuerpoDocumento) {
            throw new BadRequestError('JSON incompleto. Se requiere estructura completa del Anexo II');
        }

        console.log('📄 Transmitiendo documento DTE directo...');

        const resultado = await dteOrchestrator.transmitirDirecto(documentoDTE);

        if (resultado.exito) {
            res.json({
                exito: true,
                mensaje: 'Documento procesado exitosamente',
                datos: {
                    codigoGeneracion: documentoDTE.identificacion.codigoGeneracion,
                    numeroControl: documentoDTE.identificacion.numeroControl,
                    selloRecibido: resultado.selloRecibido,
                    fechaProcesamiento: resultado.fechaProcesamiento,
                    estado: resultado.estado,
                },
                documentoFirmado: resultado.documentoFirmado,
            });
        } else {
            res.status(400).json({
                exito: false,
                mensaje: 'Documento rechazado por Hacienda',
                error: resultado.error,
                observaciones: resultado.observaciones,
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Consultar estado de una factura
 * GET /api/dte/factura/:codigoGeneracion
 */
const consultarFactura = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;

        if (!codigoGeneracion) {
            throw new BadRequestError('Se requiere el código de generación');
        }

        const resultado = await mhSender.consultarEstado(codigoGeneracion);

        res.json({
            exito: resultado.exito,
            datos: resultado.data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Generar documento de ejemplo
 * GET /api/dte/ejemplo
 */
const generarEjemplo = async (req, res, next) => {
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', 'M001P001', 1);
        const fechaEmision = generarFechaActual();
        const horaEmision = generarHoraEmision();

        const itemEjemplo = {
            descripcion: 'ZAPATO DEPORTIVO',
            cantidad: 1.00,
            precioUnitario: 20.00,
            codigo: 'PROD001',
            tipoItem: 1,
        };

        const cuerpoDocumento = [calcularLineaProducto(itemEjemplo, 1, '01')];
        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '01');

        const documentoEjemplo = {
            identificacion: {
                version: 1,
                ambiente: config.emisor.ambiente,
                tipoDte: '01',
                numeroControl,
                codigoGeneracion,
                tipoModelo: 1,
                tipoOperacion: 1,
                tipoContingencia: null,
                motivoContin: null,
                fecEmi: fechaEmision,
                horEmi: horaEmision,
                tipoMoneda: 'USD',
            },
            documentoRelacionado: null,
            emisor: {
                nit: '14042610051018',
                nrc: '123456',
                nombre: 'RAZON SOCIAL EMISOR',
                codActividad: '12345',
                descActividad: 'VENTA DE...',
                nombreComercial: 'NOMBRE COMERCIAL',
                tipoEstablecimiento: '01',
                direccion: { departamento: '14', municipio: '04', complemento: 'DIRECCION COMPLETA' },
                telefono: '22222222',
                correo: 'emisor@correo.com',
            },
            receptor: {
                tipoDocumento: '36',
                numDocumento: '06141802020024',
                nrc: '654321',
                nombre: 'CLIENTE SA DE CV',
                codActividad: '12345',
                descActividad: 'ACTIVIDAD...',
                direccion: { departamento: '06', municipio: '14', complemento: 'DIRECCION CLIENTE' },
                telefono: '77777777',
                correo: 'cliente@correo.com',
            },
            otrosDocumentos: null,
            ventaTercero: null,
            cuerpoDocumento,
            resumen,
            extension: null,
            apendice: null,
        };

        res.json({
            exito: true,
            mensaje: 'Documento de ejemplo generado según Anexo II',
            nota: 'Este documento NO ha sido firmado ni enviado a Hacienda',
            documento: documentoEjemplo,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Probar firma (sin enviar a Hacienda)
 * POST /api/dte/test-firma
 */
const probarFirma = async (req, res, next) => {
    try {
        const documento = req.body;

        if (!documento || Object.keys(documento).length === 0) {
            throw new BadRequestError('Se requiere un documento JSON para firmar');
        }

        const resultado = await signer.firmarDocumento(
            documento,
            config.emisor.nit || '00000000000000',
            config.mh.clavePrivada
        );

        res.json({
            exito: resultado.exito,
            mensaje: resultado.mensaje,
            firma: resultado.firma,
            error: resultado.error,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Probar autenticación con Hacienda
 * GET /api/dte/test-auth
 */
const probarAutenticacion = async (req, res, next) => {
    try {
        const resultado = await mhSender.autenticar();

        res.json({
            exito: resultado.exito,
            mensaje: resultado.mensaje,
            tokenObtenido: resultado.exito ? 'Sí (por seguridad no se muestra)' : 'No',
            error: resultado.error,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearFactura,
    transmitirDirecto,
    consultarFactura,
    generarEjemplo,
    probarFirma,
    probarAutenticacion,
};
