/**
 * ========================================
 * PRUEBAS DE INVALIDACIÓN DE DTEs
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Prueba el proceso completo de invalidación (anulación) de documentos.
 * 
 * Proceso:
 * 1. Generar y enviar un DTE válido
 * 2. Obtener el sello de recepción
 * 3. Crear documento de anulación
 * 4. Firmar documento de anulación
 * 5. Enviar anulación al MH
 * 6. Validar respuesta
 */

const { printHeader, printPass, printFail, printInfo, saveLog } = require('./test_utils');
const servicioDocker = require('../src/services/servicioDocker');
const servicioMH = require('../src/services/servicioMH');
const {
    generarCodigoGeneracion,
    generarNumeroControl,
    generarFechaActual,
    generarHoraEmision
} = require('../src/utils/generadorUUID');
const {
    calcularLineaProducto,
    calcularResumenFactura
} = require('../src/utils/calculadorIVA');
const config = require('../src/config/env');
const dataGenerator = require('./data_generator');

/**
 * Genera un DTE simple para luego invalidar
 */
const generarDTEParaInvalidar = async () => {
    printInfo('PASO 1', 'Generando DTE a invalidar (Factura simple)...');

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', 'INVALID01', 1);

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);
        const receptor = dataGenerator.generarReceptor('36');

        const item = {
            numItem: 1,
            tipoItem: 2,
            cantidad: 1,
            codigo: 'SRV-001',
            descripcion: 'SERVICIO DE PRUEBA PARA INVALIDAR',
            precioUni: 100.00,
            montoDescu: 0,
            ventaNoSuj: 0,
            ventaExenta: 0,
            ventaGravada: 100.00,
            uniMedida: 99,
        };

        const cuerpoDocumento = [calcularLineaProducto(item, 1, '01')];
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        const documentoDTE = {
            identificacion: {
                version: 1,
                ambiente: config.emisor.ambiente,
                tipoDte: '01',
                numeroControl: numeroControl,
                codigoGeneracion: codigoGeneracion,
                tipoModelo: 1,
                tipoOperacion: 1,
                fecEmi: generarFechaActual(),
                horEmi: generarHoraEmision(),
                tipoMoneda: 'USD',
            },
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
                nombreComercial: emisor.nombreComercial,
                tipoEstablecimiento: '01',
                direccion: emisor.direccion,
                telefono: emisor.telefono,
                correo: emisor.correo,
            },
            receptor: {
                tipoDocumento: receptor.tipoDocumento,
                numDocumento: receptor.numDocumento,
                nombre: receptor.nombre,
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
        };

        // Firmar
        printInfo('FIRMA', 'Firmando DTE original...');
        const resultadoFirma = await servicioDocker.firmarDocumento(
            documentoDTE,
            config.emisor.nit,
            config.mh.clavePrivada
        );

        if (!resultadoFirma.exito) {
            throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);
        }
        printPass('DTE original firmado');

        // Enviar
        printInfo('ENVÍO', 'Enviando DTE original a MH...');
        const resultadoMH = await servicioMH.enviarDTE(
            resultadoFirma.firma,
            config.emisor.ambiente,
            '01',
            1
        );

        if (!resultadoMH.exito) {
            throw new Error(`DTE rechazado: ${JSON.stringify(resultadoMH.observaciones || resultadoMH.error)}`);
        }

        printPass('DTE original ACEPTADO por MH');
        printInfo('Código de Generación', codigoGeneracion);
        printInfo('Número de Control', numeroControl);

        return {
            codigoGeneracion,
            numeroControl,
            selloRecibido: resultadoMH.selloRecibido,
            tipoDte: '01',
            fechaEmision: documentoDTE.identificacion.fecEmi,
        };

    } catch (error) {
        printFail('Error generando DTE para invalidar', error);
        throw error;
    }
};

/**
 * Genera y envía documento de invalidación
 */
const invalidarDTE = async (dteOriginal) => {
    printInfo('PASO 2', 'Generando documento de invalidación...');

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('07', 'ANULA001', 1); // Tipo 07 = Invalidación

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);

        // Documento de invalidación
        const documentoInvalidacion = {
            identificacion: {
                version: 2,
                ambiente: config.emisor.ambiente,
                codigoGeneracion: codigoGeneracion,
                fecAnula: generarFechaActual(),
                horAnula: generarHoraEmision(),
            },
            emisor: {
                nit: emisor.nit,
                nombre: emisor.nombre,
                tipoEstablecimiento: '01',
                telefono: emisor.telefono,
                correo: emisor.correo,
            },
            documento: {
                tipoDte: dteOriginal.tipoDte,
                codigoGeneracion: dteOriginal.codigoGeneracion,
                selloRecibido: dteOriginal.selloRecibido,
                numeroControl: dteOriginal.numeroControl,
                fecEmi: dteOriginal.fechaEmision,
                montoIva: 0, // Calculado según DTE original
                codigoGeneracionR: null, // Si hubo reemplazo
                tipoDocumento: null,
                numDocumento: null,
                nombre: null,
                telefono: null,
                correo: null,
            },
            motivo: {
                tipoAnulacion: 1, // 1=Anulación por error, 2=Por reemplazo, etc.
                motivoAnulacion: 'DOCUMENTO DE PRUEBA - INVALIDACION REQUERIDA POR SISTEMA DE CERTIFICACION',
                nombreResponsable: emisor.nombre,
                tipDocResponsable: '36',
                numDocResponsable: emisor.nit,
                nombreSolicita: emisor.nombre,
                tipDocSolicita: '36',
                numDocSolicita: emisor.nit,
            },
        };

        printInfo('Código Invalidación', codigoGeneracion);
        printInfo('Motivo', documentoInvalidacion.motivo.motivoAnulacion);

        // Firmar invalidación
        printInfo('FIRMA', 'Firmando documento de invalidación...');
        const resultadoFirma = await servicioDocker.firmarAnulacion(
            documentoInvalidacion,
            config.emisor.nit,
            config.mh.clavePrivada
        );

        if (!resultadoFirma.exito) {
            throw new Error(`Fallo al firmar invalidación: ${resultadoFirma.error}`);
        }
        printPass('Documento de invalidación firmado');

        // Enviar invalidación
        printInfo('ENVÍO', 'Enviando invalidación a MH...');
        const resultadoMH = await servicioMH.anularDTE(resultadoFirma.firma);

        if (resultadoMH.exito) {
            printPass('¡INVALIDACIÓN ACEPTADA POR HACIENDA!');
            saveLog(`invalidacion_exito_${codigoGeneracion}.json`, {
                dteOriginal,
                invalidacion: resultadoMH.data,
            });
            return true;
        } else {
            printFail('Invalidación rechazada', resultadoMH.data);
            saveLog(`invalidacion_error_${codigoGeneracion}.json`, {
                dteOriginal,
                error: resultadoMH.data,
            });
            return false;
        }

    } catch (error) {
        printFail('Error en proceso de invalidación', error);
        throw error;
    }
};

/**
 * Ejecuta prueba completa de invalidación
 */
const ejecutarPruebaInvalidacion = async () => {
    printHeader('PRUEBA DE INVALIDACIÓN DE DTEs');

    try {
        // Autenticar primero
        printInfo('AUTH', 'Autenticando con MH...');
        const auth = await servicioMH.autenticar();
        if (!auth.exito) {
            throw new Error('Fallo de autenticación');
        }
        printPass('Autenticación exitosa');

        // Generar DTE para invalidar
        const dteOriginal = await generarDTEParaInvalidar();

        // Esperar 2 segundos antes de invalidar (el MH puede necesitar procesar)
        printInfo('ESPERA', 'Esperando 2s antes de invalidar...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Invalidar
        const resultado = await invalidarDTE(dteOriginal);

        printHeader('RESULTADO FINAL');
        if (resultado) {
            console.log('✅ Prueba de invalidación EXITOSA\n');
        } else {
            console.log('❌ Prueba de invalidación FALLIDA\n');
        }

    } catch (error) {
        printFail('Error crítico en prueba de invalidación', error);
        process.exit(1);
    }
};

// Ejecutar prueba
ejecutarPruebaInvalidacion();
