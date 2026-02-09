/**
 * ========================================
 * CONTROLADOR DTE (v2 - Multi-Tenant)
 * Módulo: DTE
 * ========================================
 * Maneja las peticiones HTTP para operaciones DTE
 * USA: req.tenant y req.emisor del middleware tenantContext
 */

const { dteOrchestrator, signer, mhSender } = require('../services');
const { dteRepository } = require('../repositories');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const { tenantService } = require('../../iam');
const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');

/**
 * Crear una nueva factura electrónica (flujo completo MULTI-TENANT)
 * POST /api/v2/facturar
 * Requiere: tenantContext middleware
 */
const crearFactura = async (req, res, next) => {
    try {
        const { receptor, items, tipoDte, condicionOperacion } = req.body;
        const { tenant, emisor } = req;

        // Validación de entrada
        if (!receptor || !items || !Array.isArray(items) || items.length === 0) {
            throw new BadRequestError('Datos incompletos: receptor e items son requeridos', 'DATOS_INCOMPLETOS');
        }

        console.log(`📄 [${tenant.nombre}] Creando factura ${tipoDte || '01'}...`);

        // Obtener credenciales desencriptadas del emisor
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Obtener siguiente correlativo
        const correlativo = await tenantService.obtenerSiguienteCorrelativo(emisor.id, tipoDte || '01');

        // Procesar factura con contexto completo
        const resultado = await dteOrchestrator.procesarFactura({
            datos: {
                receptor,
                items,
                tipoDte: tipoDte || '01',
                correlativo,
                condicionOperacion: condicionOperacion || 1,
            },
            emisor: emisorConCredenciales,
            tenantId: tenant.id,
        });

        // Persistir en BD (patrón Outbox)
        if (resultado.exito) {
            await dteRepository.crear({
                tenantId: tenant.id,
                emisorId: emisor.id,
                codigoGeneracion: resultado.datos.codigoGeneracion,
                numeroControl: resultado.datos.numeroControl,
                tipoDte: tipoDte || '01',
                version: resultado.documento.identificacion.version,
                ambiente: emisorConCredenciales.ambiente,
                fechaEmision: resultado.documento.identificacion.fecEmi,
                horaEmision: resultado.documento.identificacion.horEmi,
                receptor: {
                    tipoDocumento: receptor.tipoDocumento || '36',
                    numDocumento: receptor.numDocumento,
                    nombre: receptor.nombre,
                    correo: receptor.correo,
                },
                totales: {
                    totalGravada: resultado.documento.resumen.totalGravada,
                    totalIva: resultado.documento.resumen.totalIva || 0,
                    totalPagar: resultado.documento.resumen.totalPagar,
                },
                jsonOriginal: resultado.documento,
            }).then(dte => {
                // Actualizar a PROCESADO
                return dteRepository.actualizarEstado(dte.id, {
                    status: 'PROCESADO',
                    selloRecibido: resultado.datos.selloRecibido,
                    fechaProcesamiento: resultado.datos.fechaProcesamiento,
                    jsonFirmado: resultado.documentoFirmado,
                });
            });
        }

        if (resultado.exito) {
            res.json({
                exito: true,
                mensaje: 'Factura procesada exitosamente',
                datos: resultado.datos,
            });
        } else {
            res.status(400).json({
                exito: false,
                mensaje: 'Factura rechazada por Hacienda',
                error: resultado.error,
                observaciones: resultado.observaciones,
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Listar DTEs del tenant
 * GET /api/v2/facturas
 */
const listarFacturas = async (req, res, next) => {
    try {
        const { tenant, emisor } = req;
        const { tipoDte, status, fechaDesde, fechaHasta, page, limit } = req.query;

        const resultado = await dteRepository.listar({
            tenantId: tenant.id,
            emisorId: req.query.emisorId || emisor.id,
            tipoDte,
            status,
            fechaDesde,
            fechaHasta,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
        });

        res.json({
            exito: true,
            ...resultado,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Consultar estado de una factura
 * GET /api/v2/factura/:codigoGeneracion
 */
const consultarFactura = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;
        const { emisor } = req;

        if (!codigoGeneracion) {
            throw new BadRequestError('Se requiere el código de generación');
        }

        // Buscar en BD local - SIEMPRE filtrar por emisorId del tenant actual
        const dteLocal = await dteRepository.buscarPorCodigo(codigoGeneracion, emisor.id);

        // SEGURIDAD: Si no existe para este tenant, devolver 404
        // NUNCA revelar si el DTE existe para otro tenant
        if (!dteLocal) {
            throw new NotFoundError(`DTE no encontrado: ${codigoGeneracion}`);
        }

        // Obtener credenciales del emisor
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Consultar en Hacienda
        const resultadoMH = await mhSender.consultarEstado({
            codigoGeneracion,
            credenciales: {
                nit: emisorConCredenciales.nit,
                claveApi: emisorConCredenciales.mhClaveApi,
            },
        });

        res.json({
            exito: true,
            local: {
                status: dteLocal.status,
                selloRecibido: dteLocal.selloRecibido,
                fechaEmision: dteLocal.fechaEmision,
            },
            hacienda: resultadoMH.data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Estadísticas del tenant
 * GET /api/v2/estadisticas
 */
const estadisticas = async (req, res, next) => {
    try {
        const { tenant } = req;
        const { periodo } = req.query;

        const stats = await dteRepository.estadisticas(tenant.id, periodo || 'mes');

        res.json({
            exito: true,
            periodo: periodo || 'mes',
            datos: stats,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Generar documento de ejemplo (no requiere auth)
 * GET /api/ejemplo
 */
const generarEjemplo = async (req, res, next) => {
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', 'M001P001', 1);
        const fechaEmision = generarFechaActual();
        const horaEmision = generarHoraEmision();

        const itemEjemplo = {
            descripcion: 'PRODUCTO EJEMPLO',
            cantidad: 1.00,
            precioUnitario: 20.00,
            codigo: 'PROD001',
            tipoItem: 1,
        };

        const cuerpoDocumento = [calcularLineaProducto(itemEjemplo, 1, '01')];
        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '01');

        res.json({
            exito: true,
            mensaje: 'Documento de ejemplo según Anexo II',
            nota: 'Este documento NO ha sido firmado ni enviado',
            documento: {
                identificacion: {
                    version: 1,
                    ambiente: '00',
                    tipoDte: '01',
                    numeroControl,
                    codigoGeneracion,
                    fecEmi: fechaEmision,
                    horEmi: horaEmision,
                    tipoMoneda: 'USD',
                },
                cuerpoDocumento,
                resumen,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Probar firma (con credenciales del tenant)
 * POST /api/v2/test-firma
 */
const probarFirma = async (req, res, next) => {
    try {
        const documento = req.body;
        const { emisor } = req;

        if (!documento || Object.keys(documento).length === 0) {
            throw new BadRequestError('Se requiere un documento JSON');
        }

        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        const resultado = await signer.firmarDocumento({
            documento,
            nit: emisorConCredenciales.nit,
            clavePrivada: emisorConCredenciales.mhClavePrivada,
        });

        res.json({
            exito: resultado.exito,
            mensaje: resultado.mensaje,
            firma: resultado.exito ? '(firmado correctamente)' : null,
            error: resultado.error,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Probar autenticación (con credenciales del tenant)
 * GET /api/v2/test-auth
 */
const probarAutenticacion = async (req, res, next) => {
    try {
        const { emisor } = req;

        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        const resultado = await mhSender.autenticar({
            nit: emisorConCredenciales.nit,
            claveApi: emisorConCredenciales.mhClaveApi,
        });

        res.json({
            exito: resultado.exito,
            mensaje: resultado.mensaje,
            tokenObtenido: resultado.exito ? 'Sí' : 'No',
            error: resultado.error,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearFactura,
    listarFacturas,
    consultarFactura,
    estadisticas,
    generarEjemplo,
    probarFirma,
    probarAutenticacion,
};
