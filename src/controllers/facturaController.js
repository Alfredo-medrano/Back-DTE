/**
 * ========================================
 * CONTROLADOR DE FACTURAS
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * Estructura JSON según Anexo II de la Normativa DTE
 * 
 * Orquesta el flujo completo de facturación:
 * 1. Recibir datos simples
 * 2. Transformar a formato DTE (Anexo II)
 * 3. Firmar con Docker
 * 4. Enviar a Hacienda
 * 5. Devolver sello
 */

const config = require('../config/env');
const {
    generarCodigoGeneracion,
    generarNumeroControl,
    generarFechaActual,
    generarHoraEmision
} = require('../utils/generadorUUID');
const {
    calcularLineaProducto,
    calcularResumenFactura,
    validarCuadre,
    redondear
} = require('../utils/calculadorIVA');
const servicioDocker = require('../services/servicioDocker');
const servicioMH = require('../services/servicioMH');

/**
 * Obtiene el estado del sistema
 */
const obtenerEstado = async (req, res) => {
    try {
        const estadoDocker = await servicioDocker.verificarEstado();
        const estadoAuth = await servicioMH.autenticar();

        res.json({
            exito: true,
            sistema: 'Middleware Facturación Electrónica - El Salvador',
            version: '1.0.0',
            componentes: {
                servidor: { online: true, mensaje: 'API funcionando' },
                docker: estadoDocker,
                hacienda: {
                    online: estadoAuth.exito,
                    mensaje: estadoAuth.mensaje
                },
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

/**
 * Crea una nueva factura electrónica (flujo completo)
 * Estructura JSON según Anexo II - Normativa DTE El Salvador
 */
const crearFactura = async (req, res) => {
    try {
        const {
            emisor,
            receptor,
            items,
            tipoDte = '01',           // 01 = Factura Electrónica por defecto
            correlativo = 1,
            condicionOperacion = 1     // 1=Contado, 2=Crédito, 3=Otro
        } = req.body;

        // ========================================
        // VALIDACIÓN DE DATOS REQUERIDOS
        // ========================================
        if (!emisor || !receptor || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                exito: false,
                error: 'Datos incompletos',
                requerido: {
                    emisor: 'Objeto con datos del emisor',
                    receptor: 'Objeto con datos del receptor',
                    items: 'Array de productos/servicios (mínimo 1)',
                },
            });
        }

        console.log('📄 Iniciando creación de factura electrónica...');

        // ========================================
        // 1. GENERAR IDENTIFICADORES ÚNICOS
        // ========================================
        const codigoGeneracion = generarCodigoGeneracion();

        // NORMATIVA v2: numeroControl usa formato DTE-XX-M###P###-XXXXXXXXXXXXXXX
        // Donde M###=codEstableMH y P###=codPuntoVentaMH
        const codEstableMH = emisor.codEstableMH || 'M001';
        const codPuntoVentaMH = emisor.codPuntoVentaMH || 'P001';
        const codigoEstablecimiento = codEstableMH + codPuntoVentaMH; // Ejemplo: M001P001
        const numeroControl = generarNumeroControl(tipoDte, codigoEstablecimiento, correlativo);
        const fechaEmision = generarFechaActual();
        const horaEmision = generarHoraEmision();

        console.log(`   📋 Código Generación: ${codigoGeneracion}`);
        console.log(`   📋 Número Control: ${numeroControl}`);

        // ========================================
        // 2. PROCESAR CUERPO DEL DOCUMENTO (Items)
        // ========================================
        const cuerpoDocumento = items.map((item, index) => {
            return calcularLineaProducto(item, index + 1, tipoDte);
        });

        // ========================================
        // 3. CALCULAR RESUMEN
        // ========================================
        const resumen = calcularResumenFactura(cuerpoDocumento, condicionOperacion);

        // Validar que los cálculos cuadren
        const validacion = validarCuadre(resumen);
        if (!validacion.valido) {
            console.warn('⚠️ Advertencia:', validacion.mensaje);
        }

        // ========================================
        // 4. CONSTRUIR DOCUMENTO DTE (Anexo II)
        // ========================================
        const documentoDTE = {
            // --- IDENTIFICACIÓN ---
            identificacion: {
                version: 2,                                    // Versión del DTE (v2 requerido por MH)
                ambiente: config.emisor.ambiente,              // "00"=Pruebas, "01"=Producción
                tipoDte: tipoDte,                              // "01"=FE
                numeroControl: numeroControl,                   // DTE-01-XXXXXXXX-XXXXXXXXXXXXXXX
                codigoGeneracion: codigoGeneracion,            // UUID en mayúsculas
                tipoModelo: 1,                                 // 1=Normal
                tipoOperacion: 1,                              // 1=Transmisión normal
                tipoContingencia: null,
                motivoContin: null,
                fecEmi: fechaEmision,                          // YYYY-MM-DD
                horEmi: horaEmision,                           // HH:MM:SS
                tipoMoneda: 'USD',
            },

            // --- DOCUMENTO RELACIONADO ---
            documentoRelacionado: null,

            // --- EMISOR (v2 requiere campos adicionales) ---
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: (emisor.nombre || '').toUpperCase(),
                codActividad: emisor.codActividad,
                descActividad: (emisor.descActividad || '').toUpperCase(),
                nombreComercial: emisor.nombreComercial
                    ? emisor.nombreComercial.toUpperCase()
                    : null,
                tipoEstablecimiento: emisor.tipoEstablecimiento || '01',
                direccion: {
                    departamento: emisor.direccion?.departamento || '14',
                    municipio: emisor.direccion?.municipio || '04',
                    complemento: (emisor.direccion?.complemento || '').toUpperCase(),
                },
                telefono: emisor.telefono,
                correo: emisor.correo,
                // Campos requeridos v2
                codEstableMH: emisor.codEstableMH || '0001',    // Código establecimiento MH
                codEstable: emisor.codEstable || '0001',        // Código establecimiento interno
                codPuntoVentaMH: emisor.codPuntoVentaMH || '0001', // Código punto venta MH
                codPuntoVenta: emisor.codPuntoVenta || '0001',  // Código punto venta interno
            },

            // --- RECEPTOR ---
            receptor: {
                tipoDocumento: receptor.tipoDocumento || '36',  // 36=NIT
                numDocumento: receptor.numDocumento,
                nrc: receptor.nrc || null,
                nombre: (receptor.nombre || '').toUpperCase(),
                codActividad: receptor.codActividad || null,
                descActividad: receptor.descActividad
                    ? receptor.descActividad.toUpperCase()
                    : null,
                direccion: {
                    departamento: receptor.direccion?.departamento || '06',
                    municipio: receptor.direccion?.municipio || '14',
                    complemento: (receptor.direccion?.complemento || '').toUpperCase(),
                },
                telefono: receptor.telefono || null,
                correo: receptor.correo,
            },

            // --- OTROS DOCUMENTOS ---
            otrosDocumentos: null,

            // --- VENTA A TERCEROS ---
            ventaTercero: null,

            // --- CUERPO DEL DOCUMENTO ---
            cuerpoDocumento: cuerpoDocumento,

            // --- RESUMEN ---
            resumen: resumen,

            // --- EXTENSIÓN ---
            extension: null,

            // --- APÉNDICE ---
            apendice: null,
        };

        console.log('✅ Documento DTE construido según Anexo II');

        // DEBUG: Mostrar JSON completo para verificar estructura
        console.log('📋 DEBUG - JSON COMPLETO A ENVIAR:');
        console.log(JSON.stringify(documentoDTE, null, 2));

        // ========================================
        // 5. FIRMAR DOCUMENTO CON DOCKER
        // ========================================
        console.log('🔏 Enviando a firmar...');
        const resultadoFirma = await servicioDocker.firmarDocumento(
            documentoDTE,
            emisor.nit,
            config.mh.clavePrivada
        );

        if (!resultadoFirma.exito) {
            return res.status(500).json({
                exito: false,
                error: 'Error al firmar documento',
                detalle: resultadoFirma.error,
                documentoSinFirmar: documentoDTE,
            });
        }

        console.log('✅ Documento firmado exitosamente');

        // ========================================
        // 6. ENVIAR A HACIENDA
        // ========================================
        console.log('📤 Transmitiendo a Hacienda...');
        const resultadoMH = await servicioMH.enviarDTE(
            resultadoFirma.firma,
            config.emisor.ambiente,
            tipoDte,
            2,  // versión 2 del esquema MH
            codigoGeneracion  // UUID del documento
        );

        // ========================================
        // 7. RESPUESTA FINAL
        // ========================================
        if (resultadoMH.exito) {
            console.log('✅ Factura procesada exitosamente');
            res.json({
                exito: true,
                mensaje: 'Factura procesada exitosamente por el Ministerio de Hacienda',
                datos: {
                    codigoGeneracion: codigoGeneracion,
                    numeroControl: numeroControl,
                    selloRecibido: resultadoMH.selloRecibido,
                    fechaProcesamiento: resultadoMH.fechaProcesamiento,
                    estado: resultadoMH.estado,
                },
                documento: documentoDTE,
                documentoFirmado: resultadoFirma.firma,
            });
        } else {
            console.log('❌ Factura rechazada por Hacienda');
            res.status(400).json({
                exito: false,
                mensaje: 'Factura rechazada por Hacienda',
                error: resultadoMH.error,
                observaciones: resultadoMH.observaciones,
                documento: documentoDTE,
            });
        }

    } catch (error) {
        console.error('❌ Error en crearFactura:', error);
        res.status(500).json({
            exito: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
    }
};

/**
 * Genera un documento DTE de ejemplo (sin firmar ni enviar)
 * Útil para verificar la estructura antes de enviar
 */
const generarEjemplo = async (req, res) => {
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', '00000001', 1);
        const fechaEmision = generarFechaActual();
        const horaEmision = generarHoraEmision();

        // Ejemplo de item
        const itemEjemplo = {
            descripcion: 'ZAPATO DEPORTIVO',
            cantidad: 1.00,
            precioUnitario: 20.00,
            codigo: 'PROD001',
            tipoItem: 1,
        };

        const cuerpoDocumento = [calcularLineaProducto(itemEjemplo, 1, '01')];
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        const documentoEjemplo = {
            identificacion: {
                version: 1,
                ambiente: config.emisor.ambiente,
                tipoDte: '01',
                numeroControl: numeroControl,
                codigoGeneracion: codigoGeneracion,
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
                direccion: {
                    departamento: '14',
                    municipio: '04',
                    complemento: 'DIRECCION COMPLETA',
                },
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
                direccion: {
                    departamento: '06',
                    municipio: '14',
                    complemento: 'DIRECCION CLIENTE',
                },
                telefono: '77777777',
                correo: 'cliente@correo.com',
            },
            otrosDocumentos: null,
            ventaTercero: null,
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
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
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

/**
 * Consulta el estado de una factura
 */
const consultarFactura = async (req, res) => {
    try {
        const { codigoGeneracion } = req.params;

        if (!codigoGeneracion) {
            return res.status(400).json({
                exito: false,
                error: 'Se requiere el código de generación',
            });
        }

        const resultado = await servicioMH.consultarEstado(codigoGeneracion);

        res.json({
            exito: resultado.exito,
            datos: resultado.data,
        });

    } catch (error) {
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

/**
 * Prueba de firma (sin enviar a Hacienda)
 */
const probarFirma = async (req, res) => {
    try {
        const documento = req.body;

        if (!documento || Object.keys(documento).length === 0) {
            return res.status(400).json({
                exito: false,
                error: 'Se requiere un documento JSON para firmar',
            });
        }

        const resultado = await servicioDocker.firmarDocumento(
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
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

/**
 * Prueba de autenticación con Hacienda
 */
const probarAutenticacion = async (req, res) => {
    try {
        const resultado = await servicioMH.autenticar();

        res.json({
            exito: resultado.exito,
            mensaje: resultado.mensaje,
            tokenObtenido: resultado.exito ? 'Sí (por seguridad no se muestra)' : 'No',
            error: resultado.error,
        });

    } catch (error) {
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

/**
 * Transmitir documento DTE completo (JSON Anexo II ya armado)
 * Recibe el JSON completo, lo firma y envía a Hacienda
 */
const transmitirDirecto = async (req, res) => {
    try {
        const documentoDTE = req.body;

        // Validación básica de estructura
        if (!documentoDTE.identificacion || !documentoDTE.emisor || !documentoDTE.receptor || !documentoDTE.cuerpoDocumento) {
            return res.status(400).json({
                exito: false,
                error: 'JSON incompleto. Se requiere estructura completa del Anexo II',
                requerido: ['identificacion', 'emisor', 'receptor', 'cuerpoDocumento', 'resumen'],
            });
        }

        const tipoDte = documentoDTE.identificacion.tipoDte || '01';
        const codigoGeneracion = documentoDTE.identificacion.codigoGeneracion;

        console.log('📄 Transmitiendo documento DTE directo...');
        console.log(`   📋 Código Generación: ${codigoGeneracion}`);
        console.log(`   📋 Tipo DTE: ${tipoDte}`);

        // 1. Firmar documento con Docker
        console.log('🔏 Enviando a firmar...');
        const resultadoFirma = await servicioDocker.firmarDocumento(
            documentoDTE,
            documentoDTE.emisor.nit,
            config.mh.clavePrivada
        );

        if (!resultadoFirma.exito) {
            return res.status(500).json({
                exito: false,
                error: 'Error al firmar documento',
                detalle: resultadoFirma.error,
                documentoEnviado: documentoDTE,
            });
        }

        console.log('✅ Documento firmado exitosamente');

        // 2. Enviar a Hacienda
        console.log('📤 Transmitiendo a Hacienda...');
        const resultadoMH = await servicioMH.enviarDTE(
            resultadoFirma.firma,
            documentoDTE.identificacion.ambiente || config.emisor.ambiente,
            tipoDte,
            documentoDTE.identificacion.version || 1
        );

        // 3. Respuesta
        if (resultadoMH.exito) {
            console.log('✅ Documento procesado exitosamente');
            res.json({
                exito: true,
                mensaje: 'Documento procesado exitosamente por el Ministerio de Hacienda',
                datos: {
                    codigoGeneracion: codigoGeneracion,
                    numeroControl: documentoDTE.identificacion.numeroControl,
                    selloRecibido: resultadoMH.selloRecibido,
                    fechaProcesamiento: resultadoMH.fechaProcesamiento,
                    estado: resultadoMH.estado,
                },
                documentoFirmado: resultadoFirma.firma,
            });
        } else {
            console.log('❌ Documento rechazado por Hacienda');
            res.status(400).json({
                exito: false,
                mensaje: 'Documento rechazado por Hacienda',
                error: resultadoMH.error,
                observaciones: resultadoMH.observaciones,
                documento: documentoDTE,
            });
        }

    } catch (error) {
        console.error('❌ Error en transmitirDirecto:', error);
        res.status(500).json({
            exito: false,
            error: error.message,
        });
    }
};

module.exports = {
    obtenerEstado,
    crearFactura,
    generarEjemplo,
    consultarFactura,
    probarFirma,
    probarAutenticacion,
    transmitirDirecto,
};

