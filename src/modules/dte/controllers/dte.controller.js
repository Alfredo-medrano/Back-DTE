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

/**
 * Crear una nueva factura electrónica (flujo completo MULTI-TENANT)
 * POST /api/v2/facturar
 * Requiere: tenantContext middleware
 */
const crearFactura = async (req, res, next) => {
    let dteId = null; // Para tracking en caso de error parcial

    try {
        const { receptor, items, condicionOperacion, documentoRelacionado } = req.body;
        const tipoDte = req.body.tipoDte || '01';
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

        console.log(`📄 [${tenant.nombre}] Creando factura ${tipoDte}...`);

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
                totalGravada: documentoDTE.resumen.totalGravada,
                totalIva: documentoDTE.resumen.totalIva || 0,
                totalPagar: documentoDTE.resumen.totalPagar,
            },
            jsonOriginal: documentoDTE,
        });

        dteId = dteCreado.id;
        console.log(`📝 DTE guardado en BD: ${dteId} [CREADO]`);

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
            console.error(`🚨 [CRITICAL] DTE ${dteId} procesado por Hacienda pero falló actualización BD:`, dbError.message);
            console.error(`   Sello: ${resultado.datos?.selloRecibido || 'N/A'}`);
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
                console.error(`🚨 No se pudo actualizar DTE ${dteId} a ERROR:`, dbError.message);
            }
        }

        console.error('❌ Error en crearFactura:', error);
        console.error('Stack:', error.stack);
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
