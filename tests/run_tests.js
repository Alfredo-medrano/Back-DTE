/**
 * ========================================
 * RUN TESTS - SVFE
 * ========================================
 * Script de ejecución de pruebas para el Middleware de Facturación Electrónica.
 * Verifica paso a paso la conectividad y funcionamiento del sistema.
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

const ejecutarPruebas = async () => {
    printHeader('INICIANDO PRUEBAS DEL SISTEMA SVFE');

    // ==========================================
    // PASO 1: VERIFICAR FIRMADOR DOCKER
    // ==========================================
    printInfo('PASO 1', 'Verificando conectividad con Firmador Docker...');
    try {
        const estadoDocker = await servicioDocker.verificarEstado();
        if (estadoDocker.online) {
            printPass('Firmador Docker ONLINE');
        } else {
            throw new Error('El firmador Docker no responde. Asegúrate de que el contenedor esté corriendo.');
        }
    } catch (error) {
        printFail('Error conectando con Docker', error);
        process.exit(1); // Detener si no hay firmador
    }

    // ==========================================
    // PASO 2: AUTENTICACIÓN HACIENDA
    // ==========================================
    printInfo('PASO 2', 'Autenticando con Ministerio de Hacienda...');
    let auth;
    try {
        auth = await servicioMH.autenticar();
        if (auth.exito) {
            printPass(`Autenticación Exitosa. Token obtenido.`);
        } else {
            throw new Error(`Fallo de autenticación: ${auth.mensaje}`);
        }
    } catch (error) {
        printFail('Error en autenticación MH', error);
        process.exit(1); // Detener si no hay auth
    }

    // ==========================================
    // PASO 3: GENERAR Y ENVIAR FACTURA (DTE-01)
    // ==========================================
    printInfo('PASO 3', 'Generando y Enviando Factura de Prueba (DTE-01)...');

    try {
        // A. Preparar datos
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', '00000001', 999); // Correlativo alto para pruebas
        const fechaEmision = generarFechaActual();
        const horaEmision = generarHoraEmision();

        const emisor = {
            nit: config.emisor.nit,
            nombre: 'EMISOR DE PRUEBAS',
            codActividad: '62020',
            descActividad: 'CONSULTORIA INFORMATICA',
            direccion: {
                departamento: '14',
                municipio: '04',
                complemento: 'COLONIA ESCALON'
            },
            telefono: '22222222',
            correo: 'pruebas@test.com'
        };

        const receptor = {
            tipoDocumento: '36', // NIT
            numDocumento: '06142803901121', // NIT genérico válido para pruebas en MH? Usar uno real de prueba si existe
            nombre: 'CLIENTE DE PRUEBAS',
            direccion: {
                departamento: '06',
                municipio: '14',
                complemento: 'SAN SALVADOR'
            },
            correo: 'cliente@test.com'
        };

        const item = {
            descripcion: 'SERVICIO DE PRUEBA API',
            cantidad: 1,
            precioUnitario: 10.00,
            tipoItem: 2 // Servicio
        };

        // B. Construir cuerpo
        const cuerpoDocumento = [calcularLineaProducto(item, 1, '01')];
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        // C. Armar JSON DTE
        const documentoDTE = {
            identificacion: {
                version: 1,
                ambiente: config.emisor.ambiente,
                tipoDte: '01',
                numeroControl: numeroControl,
                codigoGeneracion: codigoGeneracion,
                tipoModelo: 1,
                tipoOperacion: 1,
                fecEmi: fechaEmision,
                horEmi: horaEmision,
                tipoMoneda: 'USD',
            },
            documentoRelacionado: null,
            emisor: {
                nit: emisor.nit,
                nrc: '123456', // NRC ficticio, a veces MH valida longitud
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
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
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
        };

        printInfo('DATOS', `Código Generación: ${codigoGeneracion}`);

        // D. Firmar
        printInfo('FIRMA', 'Solicitando firma electrónica...');
        const resultadoFirma = await servicioDocker.firmarDocumento(
            documentoDTE,
            config.emisor.nit,
            config.mh.clavePrivada
        );

        if (!resultadoFirma.exito) {
            throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);
        }
        printPass('Documento firmado correctamente');

        // E. Enviar a Hacienda
        printInfo('ENVÍO', 'Enviando a ambiente de pruebas MH...');
        const resultadoMH = await servicioMH.enviarDTE(
            resultadoFirma.firma,
            config.emisor.ambiente,
            '01',
            1
        );

        if (resultadoMH.exito) {
            printPass('¡FACTURA ACEPTADA POR HACIENDA!');
            printInfo('Sello Recibido', resultadoMH.selloRecibido);
            saveLog(`exito_${codigoGeneracion}.json`, resultadoMH);
        } else {
            printFail('Factura rechazada por Hacienda', resultadoMH);
            saveLog(`error_${codigoGeneracion}.json`, resultadoMH);
            // No hacemos exit(1) aquí necesariamente, queremos ver el log
        }

    } catch (error) {
        printFail('Error durante el proceso de facturación', error);
        process.exit(1);
    }

    printHeader('PRUEBAS FINALIZADAS');
};

ejecutarPruebas();
