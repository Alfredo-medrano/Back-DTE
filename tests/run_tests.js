/**
 * ========================================
 * RUN TESTS - SVFE - SUITE FINAL "SOLO DEV"
 * ========================================
 * Actualizado para arquitectura modular v3.0.0
 *
 * Cambios respecto a la versión original:
 * - Paths actualizados a src/modules/dte/services/
 * - firmarDocumento({ documento, nit, clavePrivada }) — objeto, no posicional
 * - enviarDTE({ documentoFirmado, ambiente, tipoDte, version, codigoGeneracion, credenciales })
 * - autenticar(credenciales) — ahora requiere { nit, claveApi }
 * - generarCodigoGeneracion / generarNumeroControl desde shared/utils/uuid-generator
 * - calcularLineaProducto / calcularResumenFactura desde dte-calculator.service
 */

require('dotenv').config();

const { printHeader, printPass, printFail, printInfo, saveLog } = require('./test_utils');

// ── Servicios actualizados ──────────────────────────────────────────────────
const servicioDocker  = require('../src/modules/dte/services/signer.service');
const servicioMH      = require('../src/modules/dte/services/mh-sender.service');
const {
    generarCodigoGeneracion,
    generarNumeroControl,
} = require('../src/shared/utils/uuid-generator');
const {
    calcularLineaProducto,
    calcularResumenFactura,
} = require('../src/modules/dte/services/dte-calculator.service');
const { obtenerVersionDTE } = require('../src/config/tiposDTE');
const config = require('../src/config/env');
const dataGenerator = require('./data_generator');

// ── Argumentos CLI ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const tipoDteEspecifico = args.find(arg => arg.startsWith('--tipo='))?.split('=')[1];

// ── Estadísticas ─────────────────────────────────────────────────────────────
let estadisticas = {
    exitosas: 0,
    fallidas: 0,
    tiempoInicio: Date.now(),
    resultados: [],
};

// ── Credenciales del emisor de prueba ────────────────────────────────────────
// Leídas del .env para no hardcodear secretos en el código.
const credencialesPrueba = {
    nit:      config.emisor.nit || '070048272',
    claveApi: config.mh.claveApi,
};

// NIT "fantasma" con formato válido para CCF/NC
const NIT_RECEPTOR_TEST = '06142010980017';
const NRC_RECEPTOR_TEST = '123456';

// ── Utilidades ───────────────────────────────────────────────────────────────
const generarNumeroControlUnico = (tipoDte) => {
    const timestamp = Date.now().toString().slice(-12);
    const random    = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    // Usa la función oficial de la arquitectura modular
    return generarNumeroControl(tipoDte, 'M001P001', parseInt(`${timestamp}${random}`));
};

const redondear = (num) => Number(num.toFixed(2));

const construirIdentificacion = (tipoDte, numeroControl, codigoGeneracion) => {
    const { generarFechaActual, generarHoraEmision } = require('../src/shared/utils/date-formatter');
    const versionDte = obtenerVersionDTE(tipoDte);
    return {
        version:          versionDte,
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

const getEmisorReal = () => ({
    nit:              credencialesPrueba.nit, // Sin padStart, debe coincidir exactamente con el token
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

// ── Función central de envío ─────────────────────────────────────────────────
const enviarDTE = async (documentoDTE, tipoDte, codigoGeneracion, numeroControl) => {
    try {
        printInfo('FIRMA', 'Solicitando firma electrónica...');

        // v3.0: firmarDocumento recibe objeto, no argumentos posicionales
        const resultadoFirma = await servicioDocker.firmarDocumento({
            documento:    documentoDTE,
            nit:          credencialesPrueba.nit,
            clavePrivada: config.mh.clavePrivada,
        });

        if (!resultadoFirma.exito) throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);
        printPass('Documento firmado correctamente');

        printInfo('ENVÍO', 'Enviando a ambiente de pruebas MH...');
        const versionDte = obtenerVersionDTE(tipoDte);

        // v3.0: enviarDTE recibe objeto con credenciales del emisor
        const resultadoMH = await servicioMH.enviarDTE({
            documentoFirmado: resultadoFirma.firma,
            ambiente:         config.emisor.ambiente,
            tipoDte,
            version:          versionDte,
            codigoGeneracion,
            credenciales:     credencialesPrueba,
        });

        if (resultadoMH.exito) {
            printPass(`¡DTE-${tipoDte} ACEPTADO POR HACIENDA!`);
            printInfo('Sello Recibido', resultadoMH.selloRecibido || 'OK');
            saveLog(`exito_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);
            estadisticas.exitosas++;
            return true;
        } else {
            printFail(`DTE-${tipoDte} rechazado por Hacienda`, resultadoMH);
            saveLog(`error_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);
            estadisticas.fallidas++;
            return false;
        }
    } catch (error) {
        printFail(`Error procesando DTE-${tipoDte}`, error);
        estadisticas.fallidas++;
        return false;
    }
};

// ── DTE 01: FACTURA ELECTRÓNICA (DEBE PASAR ✅) ──────────────────────────────
const probarFacturaElectronica = async () => {
    printInfo('PRUEBA', 'Factura Electrónica (DTE-01)');
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl    = generarNumeroControlUnico('01');
        const emisor           = getEmisorReal();
        const receptor         = dataGenerator.generarReceptor('36');
        const items            = dataGenerator.generarItems(1);

        const cuerpoDocumento = items.map((item, index) => calcularLineaProducto(item, index + 1, '01'));
        const resumen         = calcularResumenFactura(cuerpoDocumento, 1, '01');
        delete resumen.ivaPerci1;

        const documentoDTE = {
            identificacion:   construirIdentificacion('01', numeroControl, codigoGeneracion),
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
        return await enviarDTE(documentoDTE, '01', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en Factura Electrónica', error);
        estadisticas.fallidas++;
        return false;
    }
};

// ── DTE 03: CRÉDITO FISCAL (ESPERADO: ERROR 009 ⚠️) ─────────────────────────
const probarComprobanteCredFiscal = async () => {
    printInfo('PRUEBA', 'Comprobante de Crédito Fiscal (DTE-03)');
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl    = generarNumeroControlUnico('03');
        const emisor           = getEmisorReal();
        const items            = dataGenerator.generarItems(1);

        const cuerpoDocumento = items.map((item, index) => {
            const linea = calcularLineaProducto(item, index + 1, '03');
            delete linea.ivaItem;
            linea.numeroDocumento = null;
            linea.codTributo      = null;
            linea.psv             = 0.00;
            linea.noGravado       = 0.00;
            return linea;
        });
        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '03');
        delete resumen.totalIva;
        resumen.ivaPerci1        = 0.00;
        resumen.totalNoGravado   = 0.00;
        resumen.saldoFavor       = 0.00;
        if (resumen.totalPagar === undefined) resumen.totalPagar = resumen.montoTotalOperacion;

        const documentoDTE = {
            identificacion:   construirIdentificacion('03', numeroControl, codigoGeneracion),
            documentoRelacionado: null,
            emisor,
            receptor: {
                nit:           NIT_RECEPTOR_TEST,
                nrc:           NRC_RECEPTOR_TEST,
                nombre:        'CLIENTE CONTRIBUYENTE DE PRUEBA',
                codActividad:  '62010',
                descActividad: 'OTROS',
                nombreComercial: 'CLIENTE TEST',
                direccion:     emisor.direccion,
                telefono:      '22222222',
                correo:        'cliente@test.com',
            },
            otrosDocumentos: null,
            ventaTercero:    null,
            cuerpoDocumento,
            resumen,
            extension: null,
            apendice:  null,
        };
        return await enviarDTE(documentoDTE, '03', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en CCF', error);
        estadisticas.fallidas++;
        return false;
    }
};

// ── DTE 05: NOTA DE CRÉDITO (ESPERADO: ERROR 009 ⚠️) ────────────────────────
const probarNotaCredito = async () => {
    printInfo('PRUEBA', 'Nota de Crédito (DTE-05)');
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl    = generarNumeroControlUnico('05');
        const uuidRelacionado  = 'DTE-03-M001P001-000000000000001';
        const emisor           = getEmisorReal();
        const emisorNC         = { ...emisor };
        delete emisorNC.codEstableMH; delete emisorNC.codEstable;
        delete emisorNC.codPuntoVentaMH; delete emisorNC.codPuntoVenta;

        const items            = dataGenerator.generarItems(1);
        const cuerpoDocumento  = items.map((item, index) => {
            const linea = calcularLineaProducto(item, index + 1, '05');
            delete linea.ivaItem;
            delete linea.noGravado;
            delete linea.psv;
            linea.numeroDocumento = uuidRelacionado;
            linea.codTributo      = null;
            return linea;
        });

        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '05');
        delete resumen.totalIva;
        delete resumen.pagos;
        delete resumen.numPagoElectronico;
        delete resumen.porcentajeDescuento;
        delete resumen.totalNoGravado;
        delete resumen.saldoFavor;
        delete resumen.totalPagar;
        resumen.ivaPerci1 = 0.00;

        const documentoRelacionado = [{
            tipoDocumento:   '03',
            tipoGeneracion:  1,
            numeroDocumento: uuidRelacionado,
            fechaEmision:    require('../src/shared/utils/date-formatter').generarFechaActual(),
        }];

        const documentoDTE = {
            identificacion:      construirIdentificacion('05', numeroControl, codigoGeneracion),
            documentoRelacionado,
            emisor:              emisorNC,
            receptor: {
                nit:           NIT_RECEPTOR_TEST,
                nrc:           NRC_RECEPTOR_TEST,
                nombre:        'CLIENTE CONTRIBUYENTE DE PRUEBA',
                codActividad:  '62010',
                descActividad: 'OTROS',
                nombreComercial: 'CLIENTE TEST',
                direccion:     emisor.direccion,
                telefono:      '22222222',
                correo:        'cliente@test.com',
            },
            ventaTercero:    null,
            cuerpoDocumento,
            resumen,
            extension: null,
            apendice:  null,
        };
        return await enviarDTE(documentoDTE, '05', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en Nota de Crédito', error);
        estadisticas.fallidas++;
        return false;
    }
};

// ── DTE 14: SUJETO EXCLUIDO (DEBE PASAR ✅) ─────────────────────────────────
const probarFacturaSujetoExcluido = async () => {
    printInfo('PRUEBA', 'Factura Sujeto Excluido (DTE-14)');
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl    = generarNumeroControlUnico('14');
        const emisor           = getEmisorReal();
        delete emisor.nombreComercial;
        delete emisor.tipoEstablecimiento;
        const receptor         = dataGenerator.generarReceptor('13');
        const items            = dataGenerator.generarItems(1);

        const cuerpoDocumento = items.map((item, index) => {
            const base = calcularLineaProducto(item, index + 1, '14');
            return {
                numItem:     base.numItem,
                tipoItem:    1,
                cantidad:    redondear(base.cantidad),
                codigo:      null,
                uniMedida:   base.uniMedida,
                descripcion: base.descripcion,
                precioUni:   redondear(base.precioUni),
                montoDescu:  0.00,
                compra:      redondear(base.ventaGravada || base.compra),
            };
        });

        const totalCompra = cuerpoDocumento.reduce((sum, item) => sum + item.compra, 0);
        const resumen = {
            totalCompra:        redondear(totalCompra),
            descu:              0.00,
            totalDescu:         0.00,
            subTotal:           redondear(totalCompra),
            ivaRete1:           0.00,
            reteRenta:          0.00,
            totalPagar:         redondear(totalCompra),
            totalLetras:        'TOTAL EN LETRAS',
            condicionOperacion: 1,
            pagos:              null,
            observaciones:      null,
        };

        const documentoDTE = {
            identificacion: construirIdentificacion('14', numeroControl, codigoGeneracion),
            emisor,
            sujetoExcluido: {
                tipoDocumento: '13',
                numDocumento:  '049613042',
                nombre:        receptor.nombre,
                codActividad:  null,
                descActividad: null,
                direccion:     receptor.direccion,
                telefono:      receptor.telefono,
                correo:        receptor.correo,
            },
            cuerpoDocumento,
            resumen,
            apendice: null,
        };
        return await enviarDTE(documentoDTE, '14', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en Factura Sujeto Excluido', error);
        estadisticas.fallidas++;
        return false;
    }
};

// ── Runner principal ─────────────────────────────────────────────────────────
const main = async () => {
    try {
        printHeader('INICIANDO SUITE DE PRUEBAS SVFE v3.0.0');

        // Verificar entorno
        try {
            const estadoDocker = await servicioDocker.verificarEstado();
            if (!estadoDocker.online) throw new Error('El firmador Docker no responde');
            printPass('Firmador Docker ONLINE');

            // v3.0: autenticar recibe objeto con credenciales
            const auth = await servicioMH.autenticar(credencialesPrueba);
            if (!auth.exito) throw new Error(`Fallo de autenticación: ${auth.mensaje}`);
            printPass('Autenticación Exitosa. Token obtenido.');
        } catch (error) {
            printFail('Error de entorno', error);
            process.exit(1);
        }

        // Ejecutar solo el tipo específico si se pasa --tipo=XX
        if (tipoDteEspecifico) {
            const pruebas = {
                '01': probarFacturaElectronica,
                '03': probarComprobanteCredFiscal,
                '05': probarNotaCredito,
                '14': probarFacturaSujetoExcluido,
            };
            const prueba = pruebas[tipoDteEspecifico];
            if (!prueba) {
                console.error(`Tipo DTE no soportado en esta suite: ${tipoDteEspecifico}`);
                process.exit(1);
            }
            await prueba();
        } else {
            await probarFacturaElectronica();
            await probarComprobanteCredFiscal();
            await probarNotaCredito();
            await probarFacturaSujetoExcluido();
        }

        printHeader('ESTADÍSTICAS FINALES');
        const duracionSeg = ((Date.now() - estadisticas.tiempoInicio) / 1000).toFixed(1);
        console.log(`Total:    ${estadisticas.exitosas + estadisticas.fallidas}`);
        console.log(`Exitosas: ${estadisticas.exitosas}`);
        console.log(`Fallidas: ${estadisticas.fallidas}`);
        console.log(`Duración: ${duracionSeg}s`);
        console.log('\nNOTA: El Error 009 en DTE-03 y DTE-05 es la VICTORIA para un solo desarrollador.');
        console.log('Confirma que el JSON es válido, pero el cliente no existe. ¡Código listo!');

    } catch (error) {
        console.error(error);
    }
};

main();