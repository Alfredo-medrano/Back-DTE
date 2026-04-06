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
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');
const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const logger = require('../../../shared/logger');

/**
 * Crear una nueva factura electrónica (flujo completo MULTI-TENANT)
 * POST /api/v2/facturar
 * Requiere: tenantContext middleware
 */
const crearFactura = async (req, res, next) => {
    let dteId = null; // Para tracking en caso de error parcial

    try {
        // SEGURIDAD: Usar datos validados por Zod en vez de req.body crudo
        const validatedData = req.validatedBody || req.body;
        const { receptor, items, condicionOperacion, documentoRelacionado } = validatedData;
        const tipoDte = validatedData.tipoDte || '01';
        const { tenant, emisor } = req;

        // Validación de entrada
        if (!receptor || !items || !Array.isArray(items) || items.length === 0) {
            throw new BadRequestError('Datos incompletos: receptor e items son requeridos', 'DATOS_INCOMPLETOS');
        }

        // NC (DTE-05) requiere documentoRelacionado obligatoriamente
        if (tipoDte === '05' && !documentoRelacionado) {
            throw new BadRequestError(
                'documentoRelacionado es obligatorio para Nota de Crédito (DTE-05)',
                'DOCUMENTO_RELACIONADO_REQUERIDO'
            );
        }

        logger.info(`Creando factura ${tipoDte}`, { tenant: tenant.nombre, tipoDte });

        // Obtener credenciales desencriptadas del emisor
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Obtener siguiente correlativo
        const correlativo = await tenantService.obtenerSiguienteCorrelativo(emisor.id, tipoDte);

        // ═══════════════════════════════════════
        // PASO 1: Construir documento DTE
        // ═══════════════════════════════════════
        const documentoDTE = dteOrchestrator.construirDocumento({
            datos: {
                receptor,
                items,
                tipoDte,
                correlativo,
                condicionOperacion: condicionOperacion || 1,
                documentoRelacionado: documentoRelacionado || null,
            },
            emisor: emisorConCredenciales,
            tenantId: tenant.id,
        });

        // ═══════════════════════════════════════
        // PASO 2: Guardar en BD ANTES de enviar (Outbox)
        // ═══════════════════════════════════════
        const dteCreado = await dteRepository.crear({
            tenantId: tenant.id,
            emisorId: emisor.id,
            codigoGeneracion: documentoDTE.identificacion.codigoGeneracion,
            numeroControl: documentoDTE.identificacion.numeroControl,
            tipoDte,
            version: documentoDTE.identificacion.version,
            ambiente: emisorConCredenciales.ambiente,
            fechaEmision: documentoDTE.identificacion.fecEmi,
            horaEmision: documentoDTE.identificacion.horEmi,
            receptor: {
                tipoDocumento: receptor.tipoDocumento || '36',
                numDocumento: receptor.numDocumento || receptor.nit,
                nombre: receptor.nombre,
                correo: receptor.correo,
            },
            totales: {
                totalGravada: documentoDTE.resumen.totalGravada ?? documentoDTE.resumen.totalCompra ?? 0,
                totalIva: documentoDTE.resumen.totalIva || 0,
                totalPagar: documentoDTE.resumen.totalPagar,
            },
            jsonOriginal: documentoDTE,
        });

        dteId = dteCreado.id;
        logger.info(`DTE guardado en BD`, { dteId, status: 'CREADO' });

        // ═══════════════════════════════════════
        // PASO 3: Firmar y enviar a Hacienda
        // ═══════════════════════════════════════
        const resultado = await dteOrchestrator.firmarYEnviar({
            documentoDTE,
            emisor: emisorConCredenciales,
            tipoDte,
        });

        // ═══════════════════════════════════════
        // PASO 4: Actualizar estado en BD
        // ═══════════════════════════════════════
        try {
            if (resultado.exito) {
                await dteRepository.actualizarEstado(dteId, {
                    status: 'PROCESADO',
                    selloRecibido: resultado.datos.selloRecibido,
                    fechaProcesamiento: resultado.datos.fechaProcesamiento,
                    jsonFirmado: resultado.documentoFirmado,
                });
            } else {
                await dteRepository.actualizarEstado(dteId, {
                    status: 'RECHAZADO',
                    observaciones: JSON.stringify(resultado.observaciones),
                    errorLog: JSON.stringify(resultado.error),
                });
            }
        } catch (dbError) {
            // CRÍTICO: Hacienda ya procesó pero no pudimos guardar el resultado
            // El DTE queda en estado CREADO para reconciliación manual
            logger.error('CRITICAL: DTE procesado por MH pero falló actualización BD', {
                dteId,
                sello: resultado.datos?.selloRecibido || 'N/A',
                dbError: dbError.message,
            });
            // NO lanzar error al cliente — el DTE SÍ fue procesado
        }

        // Responder al cliente
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
        // Si ya guardamos en BD, marcar como ERROR
        if (dteId) {
            try {
                await dteRepository.actualizarEstado(dteId, {
                    status: 'ERROR',
                    errorLog: error.message,
                });
            } catch (dbError) {
                logger.error('No se pudo actualizar DTE a ERROR', { dteId, dbError: dbError.message });
            }
        }

        logger.error('Error en crearFactura', { error: error.message, stack: error.stack });
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

/**
 * Anular un DTE ya procesado
 * POST /api/dte/v2/factura/:codigoGeneracion/anular
 */
const anularDTE = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;
        const { motivoAnulacion, nombreSolicita, tipoSolicita, numDocSolicita, nombreResponsable, tipoResponsable, numDocResponsable } = req.body;
        const { emisor } = req;

        if (!motivoAnulacion) {
            throw new BadRequestError('motivoAnulacion es requerido', 'DATOS_INCOMPLETOS');
        }

        // Buscar DTE local — SIEMPRE filtrar por emisorId (multi-tenant)
        const dteLocal = await dteRepository.buscarPorCodigo(codigoGeneracion, emisor.id);
        if (!dteLocal) {
            throw new NotFoundError(`DTE no encontrado: ${codigoGeneracion}`);
        }

        if (dteLocal.status !== 'PROCESADO') {
            throw new BadRequestError(
                `Solo se pueden anular DTEs en estado PROCESADO. Estado actual: ${dteLocal.status}`,
                'ESTADO_INVALIDO'
            );
        }

        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Construir documento de anulación (Invalidación v2)
        const fechaActual = generarFechaActual();
        const horaActual = generarHoraEmision();
        const codigoGeneracionAnulacion = generarCodigoGeneracion();

        const documentoAnulacion = {
            identificacion: {
                version: 2,
                ambiente: emisorConCredenciales.ambiente,
                codigoGeneracion: codigoGeneracionAnulacion,
                fecAnula: fechaActual,
                horAnula: horaActual
            },
            emisor: {
                nit: emisorConCredenciales.nit,
                nombre: emisorConCredenciales.nombre,
                tipoEstablecimiento: emisorConCredenciales.tipoEstablecimiento,
                nomEstablecimiento: emisorConCredenciales.nombreComercial || emisorConCredenciales.nombre,
                codEstableMH: emisorConCredenciales.codEstableMH || null,
                codEstable: emisorConCredenciales.codEstable || null,
                codPuntoVentaMH: emisorConCredenciales.codPuntoVentaMH || null,
                codPuntoVenta: emisorConCredenciales.codPuntoVenta || null,
                telefono: emisorConCredenciales.telefono,
                correo: emisorConCredenciales.correo
            },
            documento: {
                tipoDte: dteLocal.tipoDte,
                codigoGeneracion: dteLocal.codigoGeneracion,
                selloRecibido: dteLocal.selloRecibido,
                numeroControl: dteLocal.numeroControl,
                fecEmi: dteLocal.fechaEmision.toISOString().split('T')[0],
                montoIva: dteLocal.totales?.totalIva != null ? parseFloat(dteLocal.totales.totalIva) : 0.00,
                codigoGeneracionR: null,
                tipoDocumento: dteLocal.receptor?.tipoDocumento || '36',
                numDocumento: dteLocal.receptor?.numDocumento || dteLocal.receptor?.nit || '00000000000000',
                nombre: dteLocal.receptor?.nombre || 'CONSUMIDOR FINAL'
            },
            motivo: {
                tipoAnulacion: 2, // 2 = Anulacion de DTE (error en datos)
                motivoAnulacion,
                nombreResponsable: (nombreResponsable || emisorConCredenciales.nombre).toUpperCase(),
                tipDocResponsable: tipoResponsable || '36',
                numDocResponsable: numDocResponsable || emisorConCredenciales.nit,
                nombreSolicita: (nombreSolicita || '').toUpperCase(),
                tipDocSolicita: tipoSolicita || '36',
                numDocSolicita: numDocSolicita || ''
            }
        };

        // 1. Firmar el documento de anulación
        logger.info('Firmando documento de anulación', { codigoGeneracion });
        const resultadoFirma = await signer.firmarAnulacion({
            documento: documentoAnulacion,
            nit: emisorConCredenciales.nit,
            clavePrivada: emisorConCredenciales.mhClavePrivada,
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Error al firmar anulación: ${resultadoFirma.error}`);
        }

        // 2. Enviar a Hacienda
        logger.info('Transmitiendo anulación a Hacienda', { codigoGeneracion });
        const resultado = await mhSender.anularDTE({
            documentoAnulacion: resultadoFirma.firma, // Pasamos el JWS firmado
            ambiente: emisorConCredenciales.ambiente,
            credenciales: {
                nit: emisorConCredenciales.nit,
                claveApi: emisorConCredenciales.mhClaveApi,
            },
        });

        if (resultado.exito) {
            // Actualizar estado en BD local
            await dteRepository.actualizarEstado(dteLocal.id, {
                status: 'ANULADO',
                observaciones: `Anulado: ${motivoAnulacion}`,
            });
        }

        res.json({
            exito: resultado.exito,
            mensaje: resultado.exito ? 'DTE anulado exitosamente' : 'Error al anular DTE en Hacienda',
            datos: resultado.data || null,
            error: resultado.exito ? null : resultado.error,
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
    anularDTE,
};
