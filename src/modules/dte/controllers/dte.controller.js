/**
 * ========================================
 * CONTROLADOR DTE (v2 - Multi-Tenant)
 * Módulo: DTE
 * ========================================
 * Maneja las peticiones HTTP para operaciones DTE
 * USA: req.tenant y req.emisor del middleware tenantContext
 */

const { dteOrchestrator, signer, mhSender, emailDelivery } = require('../services');
const { dteRepository } = require('../repositories');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const { tenantService } = require('../../iam');
const { calcularLineaProducto, calcularResumenFactura } = require('../services/dte-calculator.service');
const { generarCodigoGeneracion, generarNumeroControl, generarFechaActual, generarHoraEmision } = require('../../../shared/utils');
const logger = require('../../../shared/logger');
const circuitBreaker = require('../../../shared/utils/circuit-breaker');

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
        const { receptor, items, condicionOperacion, documentoRelacionado, datosExportacion, observaciones, datosPago } = validatedData;
        const tipoDte = validatedData.tipoDte || '01';
        const { tenant, emisor } = req;

        // Validación de entrada
        if (!receptor && tipoDte !== '15') {
            throw new BadRequestError('Datos incompletos: receptor es requerido', 'DATOS_INCOMPLETOS');
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new BadRequestError('Datos incompletos: items son requeridos', 'DATOS_INCOMPLETOS');
        }

        // NC (DTE-05) y ND (DTE-06) requieren documentoRelacionado obligatoriamente
        if ((tipoDte === '05' || tipoDte === '06') && !documentoRelacionado) {
            throw new BadRequestError(
                `documentoRelacionado es obligatorio para ${tipoDte === '05' ? 'Nota de Crédito (DTE-05)' : 'Nota de Débito (DTE-06)'}`,
                'DOCUMENTO_RELACIONADO_REQUERIDO'
            );
        }

        logger.info(`Creando factura ${tipoDte}`, { tenant: tenant.nombre, tipoDte });

        // Obtener credenciales desencriptadas del emisor
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Obtener siguiente correlativo
        const correlativo = await tenantService.obtenerSiguienteCorrelativo(emisor.id, tipoDte);

        // ═══════════════════════════════════════
        // CONTROL DE CONTINGENCIA ACTIVA (Circuit Breaker Abierto)
        // ═══════════════════════════════════════
        if (!circuitBreaker.puedeEjecutar('HACIENDA_MH')) {
            logger.warn('Circuit Breaker ABIERTO para HACIENDA_MH. Entrando en contingencia directa.');
            
            const contRes = await dteOrchestrator.procesarContingencia({
                datos: {
                    receptor,
                    items,
                    tipoDte,
                    correlativo,
                    condicionOperacion: condicionOperacion || 1,
                    documentoRelacionado: documentoRelacionado || null,
                    datosExportacion: datosExportacion || {},
                    observaciones: observaciones || null,
                    datosPago: datosPago || {},
                },
                emisor: emisorConCredenciales,
                tenantId: tenant.id,
            });

            // Guardar en BD directamente como CONTINGENCIA
            const dteCreado = await dteRepository.crear({
                tenantId: tenant.id,
                emisorId: emisor.id,
                codigoGeneracion: contRes.documentoDTE.identificacion.codigoGeneracion,
                numeroControl: contRes.documentoDTE.identificacion.numeroControl,
                tipoDte,
                version: contRes.documentoDTE.identificacion.version,
                ambiente: emisorConCredenciales.ambiente,
                fechaEmision: contRes.documentoDTE.identificacion.fecEmi,
                horaEmision: contRes.documentoDTE.identificacion.horEmi,
                receptor: {
                    tipoDocumento: receptor ? (receptor.tipoDocumento || '36') : '36',
                    numDocumento: receptor ? (receptor.numDocumento || receptor.nit) : '00000000000000',
                    nombre: receptor ? receptor.nombre : 'CONSUMIDOR FINAL',
                    correo: receptor ? receptor.correo : null,
                },
                totales: {
                    totalGravada: contRes.documentoDTE.resumen.totalGravada ?? contRes.documentoDTE.resumen.totalCompra ?? 0,
                    totalIva: contRes.documentoDTE.resumen.totalIva || 0,
                    totalPagar: contRes.documentoDTE.resumen.totalPagar,
                },
                jsonOriginal: contRes.documentoDTE,
            });

            const dteFinal = await dteRepository.actualizarEstado(dteCreado.id, {
                status: 'CONTINGENCIA',
                jsonFirmado: contRes.documentoFirmado,
                tipoContingencia: '4',
                motivoContin: 'SERVICIOS DE RECEPCION DEL MINISTERIO DE HACIENDA NO DISPONIBLES',
                fechaLimiteTransmision: contRes.fechaLimiteTransmision,
                observaciones: 'Modo de Contingencia directo activado por Circuit Breaker abierto.',
            });

            return res.status(201).json({
                exito: true,
                mensaje: 'Factura emitida en modo contingencia (pendiente de sello MH)',
                datos: {
                    codigoGeneracion: dteFinal.codigoGeneracion,
                    numeroControl: dteFinal.numeroControl,
                    estado: 'CONTINGENCIA',
                    fechaLimiteTransmision: dteFinal.fechaLimiteTransmision,
                },
            });
        }

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
                datosExportacion: datosExportacion || {},
                observaciones: observaciones || null,
                datosPago: datosPago || {},
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
                tipoDocumento: receptor ? (receptor.tipoDocumento || '36') : '36',
                numDocumento: receptor ? (receptor.numDocumento || receptor.nit) : '00000000000000',
                nombre: receptor ? receptor.nombre : 'CONSUMIDOR FINAL',
                correo: receptor ? receptor.correo : null,
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
        let resultado;
        try {
            resultado = await dteOrchestrator.firmarYEnviar({
                documentoDTE,
                emisor: emisorConCredenciales,
                tipoDte,
            });
        } catch (envioError) {
            logger.error('Error durante la firma y envío normal', { error: envioError.message });
            resultado = {
                exito: false,
                esErrorComunicacion: true,
                error: envioError,
                mensaje: envioError.message,
            };
        }

        // ═══════════════════════════════════════
        // FALLBACK AUTOMÁTICO A CONTINGENCIA EN CASO DE ERROR DE COMUNICACIÓN
        // ═══════════════════════════════════════
        if (resultado.esErrorComunicacion) {
            logger.warn('Error de comunicación con Hacienda. Transicionando DTE a contingencia.', { dteId });
            
            const contRes = await dteOrchestrator.procesarContingencia({
                datos: {
                    receptor,
                    items,
                    tipoDte,
                    correlativo,
                    condicionOperacion: condicionOperacion || 1,
                    documentoRelacionado: documentoRelacionado || null,
                    datosExportacion: datosExportacion || {},
                    observaciones: observaciones || null,
                    datosPago: datosPago || {},
                },
                emisor: emisorConCredenciales,
                tenantId: tenant.id,
                codigoGeneracion: documentoDTE.identificacion.codigoGeneracion,
                numeroControl: documentoDTE.identificacion.numeroControl,
                fecEmi: documentoDTE.identificacion.fecEmi,
                horEmi: documentoDTE.identificacion.horEmi,
            });

            const dteFinal = await dteRepository.actualizarEstado(dteId, {
                status: 'CONTINGENCIA',
                jsonOriginal: contRes.documentoDTE,
                jsonFirmado: contRes.documentoFirmado,
                tipoContingencia: '4',
                motivoContin: 'SERVICIOS DE RECEPCION DEL MINISTERIO DE HACIENDA NO DISPONIBLES',
                fechaLimiteTransmision: contRes.fechaLimiteTransmision,
                observaciones: 'Modo de Contingencia activado por fallo en la comunicación con Hacienda.',
            });

            return res.status(201).json({
                exito: true,
                mensaje: 'Factura emitida en modo contingencia por error de comunicación (pendiente de sello MH)',
                datos: {
                    codigoGeneracion: dteFinal.codigoGeneracion,
                    numeroControl: dteFinal.numeroControl,
                    estado: 'CONTINGENCIA',
                    fechaLimiteTransmision: dteFinal.fechaLimiteTransmision,
                },
            });
        }

        // ═══════════════════════════════════════
        // PASO 4: Actualizar estado en BD
        // ═══════════════════════════════════════
        try {
            if (resultado.exito) {
                const dteActualizado = await dteRepository.actualizarEstado(dteId, {
                    status: 'PROCESADO',
                    selloRecibido: resultado.datos.selloRecibido,
                    fechaProcesamiento: resultado.datos.fechaProcesamiento,
                    jsonFirmado: resultado.documentoFirmado,
                });

                // Asíncrono (Fire-and-forget) para no impactar la latencia de respuesta
                emailDelivery.enviarCorreoFactura({ dte: dteActualizado, emisor });
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
            tdte: dteLocal.tipoDte,
            credenciales: {
                nit: emisorConCredenciales.nit,
                claveApi: emisorConCredenciales.mhClaveApi,
            },
        });

        res.json({
            exito: true,
            dte: dteLocal.jsonOriginal || dteLocal,
            local: {
                status: dteLocal.status,
                selloRecibido: dteLocal.selloRecibido,
                fechaEmision: dteLocal.fechaEmision,
                numeroControl: dteLocal.numeroControl,
                observaciones: dteLocal.observaciones,
                errorLog: dteLocal.errorLog,
            },
            hacienda: resultadoMH.data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Conciliar estado de una factura (sincronizar con MH manualmente)
 * POST /api/v2/factura/:codigoGeneracion/conciliar
 */
const conciliarFactura = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;
        const { emisor } = req;

        if (!codigoGeneracion) {
            throw new BadRequestError('Se requiere el código de generación');
        }

        // Buscar en BD local
        const dteLocal = await dteRepository.buscarPorCodigo(codigoGeneracion, emisor.id);

        if (!dteLocal) {
            throw new NotFoundError(`DTE no encontrado: ${codigoGeneracion}`);
        }

        // Obtener credenciales del emisor
        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Consultar en Hacienda
        const resultadoMH = await mhSender.consultarEstado({
            codigoGeneracion,
            tdte: dteLocal.tipoDte,
            credenciales: {
                nit: emisorConCredenciales.nit,
                claveApi: emisorConCredenciales.mhClaveApi,
            },
        });

        // Hacienda en pruebas devuelve estado: "PROCESADO", o estadoTransaccion, depende de la API
        const estadoMH = resultadoMH.data?.estado || resultadoMH.data?.estadoTransaccion || (resultadoMH.data?.selloRecibido ? 'PROCESADO' : null);
        let estadoActualizado = dteLocal.status;
        let sello = dteLocal.selloRecibido;

        // Conciliar si MH lo procesó y nosotros no lo tenemos así
        if (estadoMH === 'PROCESADO' && dteLocal.status !== 'PROCESADO') {
            sello = resultadoMH.data?.selloRecibido;
            await dteRepository.actualizarEstado(dteLocal.id, {
                status: 'PROCESADO',
                selloRecibido: sello,
                fechaProcesamiento: resultadoMH.data?.fechaProcesamiento || new Date(),
                observaciones: 'Conciliado manualmente desde MH',
            });
            estadoActualizado = 'PROCESADO';
            logger.info(`DTE ${codigoGeneracion} conciliado a PROCESADO`);
        } else if (estadoMH === 'RECHAZADO' && dteLocal.status !== 'RECHAZADO') {
            await dteRepository.actualizarEstado(dteLocal.id, {
                status: 'RECHAZADO',
                observaciones: 'Conciliado manualmente: Rechazado por MH',
            });
            estadoActualizado = 'RECHAZADO';
            logger.info(`DTE ${codigoGeneracion} conciliado a RECHAZADO`);
        }

        res.json({
            exito: true,
            mensaje: estadoActualizado === dteLocal.status ? 'El estado ya estaba sincronizado' : `Estado actualizado a ${estadoActualizado}`,
            local: {
                status: estadoActualizado,
                selloRecibido: sello,
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
 * Anular un DTE ya procesado (Invalidación v2 del MH)
 * POST /api/dte/v2/factura/:codigoGeneracion/anular
 *
 * Request body:
 *   - motivoAnulacion: string (texto descriptivo del motivo)
 *   - tipoAnulacion: number (1=Reemplazo, 2=Error en datos, 3=Otro) — default 2
 *   - nombreSolicita: string (nombre de quien solicita)
 *   - tipoSolicita: string (tipo doc del solicitante, default '36' NIT)
 *   - numDocSolicita: string (número de documento del solicitante)
 *   - nombreResponsable: string (nombre del responsable, default = emisor)
 *   - tipoResponsable: string (tipo doc del responsable, default '36')
 *   - numDocResponsable: string (número doc del responsable, default = NIT emisor)
 */
const anularDTE = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;
        const {
            motivoAnulacion,
            tipoAnulacion,
            nombreSolicita,
            tipoSolicita,
            numDocSolicita,
            nombreResponsable,
            tipoResponsable,
            numDocResponsable,
        } = req.body;
        const { emisor } = req;

        if (!motivoAnulacion) {
            throw new BadRequestError('motivoAnulacion es requerido (texto descriptivo del motivo)', 'DATOS_INCOMPLETOS');
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

        if (!dteLocal.selloRecibido) {
            throw new BadRequestError(
                'El DTE no tiene sello de recepción de Hacienda. No se puede invalidar.',
                'SIN_SELLO'
            );
        }

        const emisorConCredenciales = await tenantService.obtenerEmisorConCredenciales(emisor.id);

        // Construir documento de invalidación (Versión 2 — Anexo II MH)
        const fechaActual = generarFechaActual();
        const horaActual = generarHoraEmision();
        const codigoGeneracionAnulacion = generarCodigoGeneracion();

        // FIX: Use flat Prisma model fields (not nested objects)
        // DB columns: totalIva, receptorTipoDoc, receptorNumDoc, receptorNombre
        const montoIva = dteLocal.totalIva != null ? parseFloat(dteLocal.totalIva) : 0.00;
        const tipoDocReceptor = dteLocal.receptorTipoDoc || '36';
        const numDocReceptor = dteLocal.receptorNumDoc || '00000000000000';
        const nombreReceptor = dteLocal.receptorNombre || 'CONSUMIDOR FINAL';
        const fechaEmi = dteLocal.fechaEmision instanceof Date
            ? dteLocal.fechaEmision.toISOString().split('T')[0]
            : String(dteLocal.fechaEmision).split('T')[0];

        const documentoAnulacion = {
            identificacion: {
                version: 2,
                ambiente: emisorConCredenciales.ambiente,
                codigoGeneracion: codigoGeneracionAnulacion,
                fecAnula: fechaActual,
                horAnula: horaActual,
            },
            emisor: {
                nit: emisorConCredenciales.nit,
                nombre: emisorConCredenciales.nombre,
                tipoEstablecimiento: emisorConCredenciales.tipoEstablecimiento || '01',
                nomEstablecimiento: emisorConCredenciales.nombreComercial || emisorConCredenciales.nombre,
                codEstableMH: emisorConCredenciales.codEstableMH || null,
                codEstable: emisorConCredenciales.codEstable || null,
                codPuntoVentaMH: emisorConCredenciales.codPuntoVentaMH || null,
                codPuntoVenta: emisorConCredenciales.codPuntoVenta || null,
                telefono: emisorConCredenciales.telefono,
                correo: emisorConCredenciales.correo,
            },
            documento: {
                tipoDte: dteLocal.tipoDte,
                codigoGeneracion: dteLocal.codigoGeneracion,
                selloRecibido: dteLocal.selloRecibido,
                numeroControl: dteLocal.numeroControl,
                fecEmi: fechaEmi,
                montoIva,
                codigoGeneracionR: null, // Código de documento de reemplazo (null si no aplica)
                tipoDocumento: tipoDocReceptor,
                numDocumento: numDocReceptor,
                nombre: nombreReceptor,
            },
            motivo: {
                tipoAnulacion: tipoAnulacion || 2, // 2 = Error en datos (default)
                motivoAnulacion: String(motivoAnulacion),
                nombreResponsable: (nombreResponsable || emisorConCredenciales.nombre).toUpperCase(),
                tipDocResponsable: tipoResponsable || '36',
                numDocResponsable: numDocResponsable || emisorConCredenciales.nit,
                nombreSolicita: (nombreSolicita || nombreReceptor).toUpperCase(),
                tipDocSolicita: tipoSolicita || tipoDocReceptor,
                numDocSolicita: numDocSolicita || numDocReceptor,
            },
        };

        // 1. Firmar el documento de invalidación
        logger.info('Firmando documento de invalidación', { codigoGeneracion });
        const resultadoFirma = await signer.firmarAnulacion({
            documento: documentoAnulacion,
            nit: emisorConCredenciales.nit,
            clavePrivada: emisorConCredenciales.mhClavePrivada,
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Error al firmar invalidación: ${resultadoFirma.error}`);
        }

        // 2. Enviar a Hacienda
        logger.info('Transmitiendo invalidación a Hacienda', { codigoGeneracion });
        const resultado = await mhSender.anularDTE({
            documentoAnulacion: resultadoFirma.firma,
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

/**
 * Consultar DTE de forma pública (session-less)
 * GET /api/dte/public/factura/:codigoGeneracion
 */
const consultarFacturaPublica = async (req, res, next) => {
    try {
        const { codigoGeneracion } = req.params;

        if (!codigoGeneracion) {
            throw new BadRequestError('Se requiere el código de generación');
        }

        const dteLocal = await dteRepository.buscarPorCodigoPublico(codigoGeneracion);

        if (!dteLocal) {
            throw new NotFoundError(`DTE no encontrado: ${codigoGeneracion}`);
        }

        res.json({
            exito: true,
            dte: dteLocal.jsonOriginal || dteLocal,
            local: {
                status: dteLocal.status,
                selloRecibido: dteLocal.selloRecibido,
                fechaEmision: dteLocal.fechaEmision,
                numeroControl: dteLocal.numeroControl,
                // SECURITY FIX (A2): errorLog and observaciones excluded from public endpoint
                emisor: dteLocal.emisor, // Already filtered by repository select projection
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    crearFactura,
    listarFacturas,
    consultarFactura,
    conciliarFactura,
    consultarFacturaPublica,
    estadisticas,
    generarEjemplo,
    probarFirma,
    probarAutenticacion,
    anularDTE,
};
