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
const servicioDocker = require('../src/modules/dte/services/signer.service');
const servicioMH = require('../src/modules/dte/services/mh-sender.service');
const {
    generarCodigoGeneracion,
    generarNumeroControl,
} = require('../src/shared/utils/uuid-generator');
const {
    generarFechaActual,
    generarHoraEmision
} = require('../src/shared/utils/date-formatter');
const {
    calcularLineaProducto,
    calcularResumenFactura
} = require('../src/modules/dte/services/dte-calculator.service');
const config = require('../src/config/env');

const credencialesPrueba = {
    nit: config.emisor.nit || '070048272',
    claveApi: config.mh.claveApi,
};
const dataGenerator = require('./data_generator');

const generarNumeroControlUnico = (tipoDte) => {
    const timestamp = Date.now().toString().slice(-12);
    const random    = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    return generarNumeroControl(tipoDte, 'M001P001', parseInt(`${timestamp}${random}`));
};

const getEmisorReal = () => ({
    nit:              credencialesPrueba.nit,
    nrc:              '3799647',
    nombre:           'ALFREDO EZEQUIEL MEDRANO MARTINEZ',
    codActividad:     '62010',
    descActividad:    'PROGRAMACION INFORMATICA',
    nombreComercial:  'ALFREDO MEDRANO',
    tipoEstablecimiento: '01',
    direccion: {
        departamento: '14',
        municipio:    '04',
        complemento:  'CANTON EL PILON, CONCHAGUA',
    },
    telefono:        '22222222',
    correo:          'test@test.com',
    codEstableMH:    'M001',
    codEstable:      'M001',
    codPuntoVentaMH: 'P001',
    codPuntoVenta:   'P001',
});

const construirIdentificacion = (tipoDte, numeroControl, codigoGeneracion) => {
    return {
        version:          1,
        ambiente:         config.emisor.ambiente,
        tipoDte,
        numeroControl,
        codigoGeneracion,
        tipoModelo:       1,
        tipoOperacion:    1,
        tipoContingencia: null,
        motivoContin:     null,
        fecEmi:           generarFechaActual(),
        horEmi:           generarHoraEmision(),
        tipoMoneda:       'USD',
    };
};

/**
 * Genera un DTE simple para luego invalidar
 */
const generarDTEParaInvalidar = async () => {
    printInfo('PASO 1', 'Generando DTE a invalidar (Factura simple)...');

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControlUnico('01');

        const emisor = getEmisorReal();
        const receptor = dataGenerator.generarReceptor('36');
        const items = dataGenerator.generarItems(1);

        const cuerpoDocumento = items.map((item, index) => calcularLineaProducto(item, index + 1, '01'));
        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '01');
        delete resumen.ivaPerci1;

        const documentoDTE = {
            identificacion: construirIdentificacion('01', numeroControl, codigoGeneracion),
            documentoRelacionado: null,
            emisor,
            receptor: {
                tipoDocumento: '36',
                numDocumento:  '06142803901121',
                nombre:        'CLIENTE CONSUMIDOR FINAL',
                nrc:           null,
                codActividad:  null,
                descActividad: null,
                direccion:     receptor.direccion,
                telefono:      receptor.telefono,
                correo:        receptor.correo,
            },
            otrosDocumentos: null,
            ventaTercero:    null,
            cuerpoDocumento,
            resumen,
            extension: null,
            apendice:  null,
        };

        // Firmar
        printInfo('FIRMA', 'Firmando DTE original...');
        const resultadoFirma = await servicioDocker.firmarDocumento({
            documento: documentoDTE,
            nit: credencialesPrueba.nit,
            clavePrivada: config.mh.clavePrivada
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);
        }
        printPass('DTE original firmado');

        // Enviar
        printInfo('ENVÍO', 'Enviando DTE original a MH...');
        const resultadoMH = await servicioMH.enviarDTE({
            documentoFirmado: resultadoFirma.firma,
            ambiente: config.emisor.ambiente,
            tipoDte: '01',
            version: 1,
            codigoGeneracion,
            credenciales: credencialesPrueba
        });

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
        const emisor = getEmisorReal();

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
                codEstable: emisor.codEstable || 'M001',
                codPuntoVenta: emisor.codPuntoVenta || 'P001',
                nomEstablecimiento: emisor.nombreComercial || 'ALFREDO MEDRANO',
            },
            documento: {
                tipoDte: dteOriginal.tipoDte,
                codigoGeneracion: dteOriginal.codigoGeneracion,
                selloRecibido: dteOriginal.selloRecibido,
                numeroControl: dteOriginal.numeroControl,
                fecEmi: dteOriginal.fechaEmision,
                montoIva: 0.00,
                tipoDocumento: '36',
                numDocumento: '06142803901121',
                nombre: 'CLIENTE CONSUMIDOR FINAL',
                telefono: '22222222',
                correo: 'test@test.com',
                codigoGeneracionR: null,
            },
            motivo: {
                tipoAnulacion: 2, // 2 = Anulación por reemplazo (requiere codigoGeneracionR: null según schema v2)
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
        const resultadoFirma = await servicioDocker.firmarAnulacion({
            documento: documentoInvalidacion,
            nit: credencialesPrueba.nit,
            clavePrivada: config.mh.clavePrivada
        });

        if (!resultadoFirma.exito) {
            throw new Error(`Fallo al firmar invalidación: ${resultadoFirma.error}`);
        }
        printPass('Documento de invalidación firmado');

        // Enviar invalidación
        printInfo('ENVÍO', 'Enviando invalidación a MH...');
        const resultadoMH = await servicioMH.anularDTE({
            documentoAnulacion: resultadoFirma.firma,
            ambiente: config.emisor.ambiente,
            credenciales: credencialesPrueba
        });

        if (resultadoMH.exito) {
            printPass('¡INVALIDACIÓN ACEPTADA POR HACIENDA!');
            saveLog(`invalidacion_exito_${codigoGeneracion}.json`, {
                dteOriginal,
                invalidacion: resultadoMH.data,
            });
            return true;
        } else {
            printFail('Invalidación rechazada', resultadoMH.error || resultadoMH.data);
            saveLog(`invalidacion_error_${codigoGeneracion}.json`, {
                dteOriginal,
                error: resultadoMH.error || resultadoMH.data,
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
        const auth = await servicioMH.autenticar(credencialesPrueba);
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
