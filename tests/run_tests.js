/**
 * ========================================
 * RUN TESTS - SVFE - SUITE COMPLETA
 * ========================================
 * Suite de pruebas completa para el Middleware de Facturación Electrónica.
 * Soporta todos los tipos de DTE requeridos por el Ministerio de Hacienda.
 * 
 * TIPOS DE DTE SOPORTADOS:
 * - 01: Factura Electrónica
 * - 03: Comprobante de Crédito Fiscal (CCF)
 * - 04: Nota de Remisión
 * - 05: Nota de Crédito
 * - 06: Nota de Débito
 * - 11: Factura de Exportación
 * - 14: Factura de Sujeto Excluido
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

// Argumentos de línea de comandos
const args = process.argv.slice(2);
const tipoDteEspecifico = args.find(arg => arg.startsWith('--tipo='))?.split('=')[1];

// Contador global de pruebas
let estadisticas = {
    exitosas: 0,
    fallidas: 0,
    tiempoInicio: Date.now(),
    resultados: [],
};

/**
 * Construye la estructura base de identificación del DTE
 */
const construirIdentificacion = (tipoDte, numeroControl, codigoGeneracion) => {
    return {
        version: 1,
        ambiente: config.emisor.ambiente,
        tipoDte: tipoDte,
        numeroControl: numeroControl,
        codigoGeneracion: codigoGeneracion,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContin: null,
        fecEmi: generarFechaActual(),
        horEmi: generarHoraEmision(),
        tipoMoneda: 'USD',
    };
};

/**
 * Prueba DTE-01: Factura Electrónica
 * - Para ventas a consumidores finales
 * - El tipo de documento más común
 */
const probarFacturaElectronica = async (numeroTest = 1) => {
    printInfo('PRUEBA', `Factura Electrónica (DTE-01) #${numeroTest}`);

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('01', numeroTest.toString().padStart(8, '0'), 999);

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);
        const receptor = dataGenerator.generarReceptor('36'); // NIT
        const items = dataGenerator.generarItems(Math.floor(Math.random() * 3) + 1); // 1-3 items

        // Calcular cuerpo y resumen
        const cuerpoDocumento = items.map((item, index) =>
            calcularLineaProducto(item, index + 1, '01')
        );
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        const documentoDTE = {
            identificacion: construirIdentificacion('01', numeroControl, codigoGeneracion),
            documentoRelacionado: null,
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
                nombreComercial: emisor.nombreComercial,
                tipoEstablecimiento: emisor.tipoEstablecimiento,
                direccion: emisor.direccion,
                telefono: emisor.telefono,
                correo: emisor.correo,
            },
            receptor: {
                tipoDocumento: receptor.tipoDocumento,
                numDocumento: receptor.numDocumento,
                nombre: receptor.nombre,
                codActividad: null,
                descActividad: null,
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
            extension: null,
            apendice: null,
        };

        return await enviarDTE(documentoDTE, '01', codigoGeneracion, numeroControl);

    } catch (error) {
        printFail('Error en Factura Electrónica', error);
        estadisticas.fallidas++;
        return false;
    }
};

/**
 * Prueba DTE-03: Comprobante de Crédito Fiscal (CCF)
 * - Para transacciones entre contribuyentes del IVA
 * - Permite deducción de crédito fiscal
 */
const probarComprobanteCredFiscal = async (numeroTest = 1) => {
    printInfo('PRUEBA', `Comprobante de Crédito Fiscal (DTE-03) #${numeroTest}`);

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('03', numeroTest.toString().padStart(8, '0'), 999);

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);
        const receptor = dataGenerator.generarReceptor('36'); // Debe ser NIT para CCF
        const items = dataGenerator.generarItems(Math.floor(Math.random() * 4) + 1);

        const cuerpoDocumento = items.map((item, index) =>
            calcularLineaProducto(item, index + 1, '03')
        );
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        const documentoDTE = {
            identificacion: construirIdentificacion('03', numeroControl, codigoGeneracion),
            documentoRelacionado: null,
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
                nombreComercial: emisor.nombreComercial,
                tipoEstablecimiento: emisor.tipoEstablecimiento,
                direccion: emisor.direccion,
                telefono: emisor.telefono,
                correo: emisor.correo,
            },
            receptor: {
                tipoDocumento: receptor.tipoDocumento,
                numDocumento: receptor.numDocumento,
                nrc: receptor.nrc || '000000',
                nombre: receptor.nombre,
                codActividad: emisor.codActividad, // Receptor también con actividad
                descActividad: emisor.descActividad,
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
            extension: null,
            apendice: null,
        };

        return await enviarDTE(documentoDTE, '03', codigoGeneracion, numeroControl);

    } catch (error) {
        printFail('Error en CCF', error);
        estadisticas.fallidas++;
        return false;
    }
};

/**
 * Prueba DTE-05: Nota de Crédito
 * - Para anulaciones o devoluciones parciales/totales
 * - Debe referenciar documento original
 */
const probarNotaCredito = async (numeroTest = 1) => {
    printInfo('PRUEBA', `Nota de Crédito (DTE-05) #${numeroTest}`);

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('05', numeroTest.toString().padStart(8, '0'), 999);

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);
        const receptor = dataGenerator.generarReceptor('36');
        const items = dataGenerator.generarItems(1); // Generalmente 1 item en NC

        const cuerpoDocumento = items.map((item, index) =>
            calcularLineaProducto(item, index + 1, '05')
        );
        const resumen = calcularResumenFactura(cuerpoDocumento, 1);

        // Documento relacionado (factura original que se está creditando)
        const documentoRelacionado = [{
            tipoDocumento: '01', // Factura
            tipoGeneracion: 1,
            numeroDocumento: 'DTE-01-TEST-000001',
            fechaEmision: generarFechaActual(),
        }];

        const documentoDTE = {
            identificacion: construirIdentificacion('05', numeroControl, codigoGeneracion),
            documentoRelacionado: documentoRelacionado,
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
                nombreComercial: emisor.nombreComercial,
                tipoEstablecimiento: emisor.tipoEstablecimiento,
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
            extension: null,
        };

        return await enviarDTE(documentoDTE, '05', codigoGeneracion, numeroControl);

    } catch (error) {
        printFail('Error en Nota de Crédito', error);
        estadisticas.fallidas++;
        return false;
    }
};

/**
 * Prueba DTE-14: Factura de Sujeto Excluido
 * - Para personas naturales o pequeños contribuyentes excluidos del IVA
 */
const probarFacturaSujetoExcluido = async (numeroTest = 1) => {
    printInfo('PRUEBA', `Factura Sujeto Excluido (DTE-14) #${numeroTest}`);

    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControl('14', numeroTest.toString().padStart(8, '0'), 999);

        const emisor = dataGenerator.generarEmisor(config.emisor.nit);
        const receptor = dataGenerator.generarReceptor('13'); // DUI para sujeto excluido
        const items = dataGenerator.generarItems(Math.floor(Math.random() * 2) + 1);

        const cuerpoDocumento = items.map((item, index) =>
            calcularLineaProducto(item, index + 1, '14')
        );

        // Resumen simplificado para sujeto excluido
        const resumen = {
            totalNoSuj: 0,
            totalExenta: 0,
            totalGravada: cuerpoDocumento.reduce((sum, item) => sum + item.ventaGravada, 0),
            subTotalVentas: cuerpoDocumento.reduce((sum, item) => sum + item.ventaGravada, 0),
            totalPagar: cuerpoDocumento.reduce((sum, item) => sum + item.ventaGravada, 0),
            condicionOperacion: 1, // Contado
            totalLetras: 'TOTAL EN LETRAS',
        };

        const documentoDTE = {
            identificacion: construirIdentificacion('14', numeroControl, codigoGeneracion),
            emisor: {
                nit: emisor.nit,
                nrc: emisor.nrc,
                nombre: emisor.nombre,
                codActividad: emisor.codActividad,
                descActividad: emisor.descActividad,
                nombreComercial: emisor.nombreComercial,
                direccion: emisor.direccion,
                telefono: emisor.telefono,
                correo: emisor.correo,
            },
            sujetoExcluido: {
                tipoDocumento: receptor.tipoDocumento,
                numDocumento: receptor.numDocumento,
                nombre: receptor.nombre,
                codActividad: '86201',
                descActividad: 'OTROS',
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
        };

        return await enviarDTE(documentoDTE, '14', codigoGeneracion, numeroControl);

    } catch (error) {
        printFail('Error en Factura Sujeto Excluido', error);
        estadisticas.fallidas++;
        return false;
    }
};

/**
 * Función genérica para firmar y enviar DTE
 */
const enviarDTE = async (documentoDTE, tipoDte, codigoGeneracion, numeroControl) => {
    try {
        // Firmar
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

        // Enviar a Hacienda
        printInfo('ENVÍO', 'Enviando a ambiente de pruebas MH...');
        const resultadoMH = await servicioMH.enviarDTE(
            resultadoFirma.firma,
            config.emisor.ambiente,
            tipoDte,
            1
        );

        if (resultadoMH.exito) {
            printPass(`¡DTE-${tipoDte} ACEPTADO POR HACIENDA!`);
            printInfo('Sello Recibido', resultadoMH.selloRecibido || 'OK');
            saveLog(`exito_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);

            estadisticas.exitosas++;
            estadisticas.resultados.push({
                tipo: tipoDte,
                codigo: codigoGeneracion,
                numero: numeroControl,
                estado: 'EXITO',
                sello: resultadoMH.selloRecibido,
            });

            return true;
        } else {
            printFail(`DTE-${tipoDte} rechazado por Hacienda`, resultadoMH);
            saveLog(`error_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);

            estadisticas.fallidas++;
            estadisticas.resultados.push({
                tipo: tipoDte,
                codigo: codigoGeneracion,
                numero: numeroControl,
                estado: 'FALLO',
                error: resultadoMH.observaciones || resultadoMH.error,
            });

            return false;
        }

    } catch (error) {
        printFail(`Error procesando DTE-${tipoDte}`, error);
        estadisticas.fallidas++;
        return false;
    }
};

/**
 * Ejecuta pruebas básicas del sistema
 */
const ejecutarPruebasBasicas = async () => {
    printHeader('PRUEBAS BÁSICAS DEL SISTEMA');

    // Paso 1: Verificar Firmador Docker
    printInfo('PASO 1', 'Verificando conectividad con Firmador Docker...');
    try {
        const estadoDocker = await servicioDocker.verificarEstado();
        if (estadoDocker.online) {
            printPass('Firmador Docker ONLINE');
        } else {
            throw new Error('El firmador Docker no responde');
        }
    } catch (error) {
        printFail('Error conectando con Docker', error);
        process.exit(1);
    }

    // Paso 2: Autenticación Hacienda
    printInfo('PASO 2', 'Autenticando con Ministerio de Hacienda...');
    try {
        const auth = await servicioMH.autenticar();
        if (auth.exito) {
            printPass('Autenticación Exitosa. Token obtenido.');
        } else {
            throw new Error(`Fallo de autenticación: ${auth.mensaje}`);
        }
    } catch (error) {
        printFail('Error en autenticación MH', error);
        process.exit(1);
    }
};

/**
 * Ejecuta suite de pruebas para un tipo de DTE específico
 */
const ejecutarPruebasTipo = async (tipoDte, cantidad = 1) => {
    printHeader(`PRUEBAS DTE-${tipoDte}`);

    let funcionPrueba;
    let nombreTipo;

    switch (tipoDte) {
        case '01':
            funcionPrueba = probarFacturaElectronica;
            nombreTipo = 'Factura Electrónica';
            break;
        case '03':
            funcionPrueba = probarComprobanteCredFiscal;
            nombreTipo = 'Comprobante de Crédito Fiscal';
            break;
        case '05':
            funcionPrueba = probarNotaCredito;
            nombreTipo = 'Nota de Crédito';
            break;
        case '14':
            funcionPrueba = probarFacturaSujetoExcluido;
            nombreTipo = 'Factura Sujeto Excluido';
            break;
        default:
            printFail('Tipo de DTE no implementado', { tipo: tipoDte });
            return;
    }

    console.log(`\nEjecutando ${cantidad} prueba(s) de ${nombreTipo}...\n`);

    for (let i = 1; i <= cantidad; i++) {
        await funcionPrueba(i);

        // Pausa entre pruebas para no saturar la API
        if (i < cantidad) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
};

/**
 * Muestra estadísticas finales
 */
const mostrarEstadisticas = () => {
    printHeader('ESTADÍSTICAS FINALES');

    const tiempoTotal = ((Date.now() - estadisticas.tiempoInicio) / 1000).toFixed(2);
    const total = estadisticas.exitosas + estadisticas.fallidas;
    const porcentajeExito = total > 0 ? ((estadisticas.exitosas / total) * 100).toFixed(1) : 0;

    console.log(`Total de pruebas: ${total}`);
    console.log(`✓ Exitosas: ${estadisticas.exitosas} (${porcentajeExito}%)`);
    console.log(`✗ Fallidas: ${estadisticas.fallidas}`);
    console.log(`⏱ Tiempo total: ${tiempoTotal}s\n`);

    // Guardar reporte completo
    const reporte = {
        fecha: new Date().toISOString(),
        estadisticas: {
            total,
            exitosas: estadisticas.exitosas,
            fallidas: estadisticas.fallidas,
            porcentajeExito,
            tiempoSegundos: parseFloat(tiempoTotal),
        },
        resultados: estadisticas.resultados,
        ambiente: config.emisor.ambiente,
        nit: config.emisor.nit,
    };

    saveLog(`reporte_${Date.now()}.json`, reporte);
};

/**
 * Script principal
 */
const main = async () => {
    try {
        printHeader('INICIANDO SUITE DE PRUEBAS SVFE');

        // Pruebas básicas primero
        await ejecutarPruebasBasicas();

        // Si se especificó un tipo, solo ejecutar ese
        if (tipoDteEspecifico) {
            await ejecutarPruebasTipo(tipoDteEspecifico, 1);
        } else {
            // Ejecutar prueba de cada tipo
            await ejecutarPruebasTipo('01', 1); // Factura
            await ejecutarPruebasTipo('03', 1); // CCF
            await ejecutarPruebasTipo('05', 1); // Nota Crédito
            await ejecutarPruebasTipo('14', 1); // Sujeto Excluido
        }

        mostrarEstadisticas();
        printHeader('PRUEBAS FINALIZADAS');

    } catch (error) {
        printFail('Error crítico en suite de pruebas', error);
        process.exit(1);
    }
};

// Ejecutar suite
main();
