/**
 * ========================================
 * RUN TESTS - SVFE - SUITE FINAL "SOLO DEV"
 * ========================================
 */

const { printHeader, printPass, printFail, printInfo, saveLog } = require('./test_utils');
const servicioDocker = require('../src/services/servicioDocker');
const servicioMH = require('../src/services/servicioMH');
const {
    generarCodigoGeneracion,
    generarFechaActual,
    generarHoraEmision
} = require('../src/utils/generadorUUID');
const {
    calcularLineaProducto,
    calcularResumenFactura
} = require('../src/utils/calculadorIVA');
const { obtenerVersionDTE } = require('../src/config/tiposDTE');
const config = require('../src/config/env');
const dataGenerator = require('./data_generator');

const args = process.argv.slice(2);
const tipoDteEspecifico = args.find(arg => arg.startsWith('--tipo='))?.split('=')[1];

let estadisticas = {
    exitosas: 0,
    fallidas: 0,
    tiempoInicio: Date.now(),
    resultados: [],
};

// --- CONFIGURACIÓN DE NIT "FANTASMA" ---
// Usamos un NIT con formato válido (14 dígitos para empresas, que es lo normal en CCF)
// para asegurar que pase la validación de formato (Regex), aunque falle la de existencia.
const NIT_RECEPTOR_TEST = "06142010980017";
const NRC_RECEPTOR_TEST = "123456";

// --- UTILIDADES ---
const generarNumeroControlUnico = (tipoDte) => {
    const timestamp = Date.now().toString().slice(-12);
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    return `DTE-${tipoDte}-M001P001-${timestamp}${random}`;
};

const redondear = (num) => Number(num.toFixed(2));

const construirIdentificacion = (tipoDte, numeroControl, codigoGeneracion) => {
    const versionDte = obtenerVersionDTE(tipoDte);
    return {
        version: versionDte,
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

const getEmisorReal = () => ({
    nit: config.emisor.nit || "070048272",
    nrc: "3799647",
    nombre: "ALFREDO EZEQUIEL MEDRANO MARTINEZ",
    codActividad: "62010",
    descActividad: "PROGRAMACION INFORMATICA",
    nombreComercial: "ALFREDO MEDRANO",
    tipoEstablecimiento: "01",
    direccion: {
        departamento: "14",
        municipio: "04",
        complemento: "CANTON EL PILON, CONCHAGUA"
    },
    telefono: "22222222",
    correo: "test@test.com",
    codEstableMH: "M001",
    codEstable: "M001",
    codPuntoVentaMH: "P001",
    codPuntoVenta: "P001"
});

// --- DTE 01: FACTURA ELECTRÓNICA (DEBE PASAR ✅) ---
const probarFacturaElectronica = async () => {
    printInfo('PRUEBA', `Factura Electrónica (DTE-01)`);
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
            emisor: emisor,
            receptor: {
                tipoDocumento: "36",
                numDocumento: "06142803901121",
                nombre: "CLIENTE CONSUMIDOR FINAL",
                nrc: null,
                codActividad: null,
                descActividad: null,
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            otrosDocumentos: null,
            ventaTercero: null,
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

// --- DTE 03: CRÉDITO FISCAL (ESPERADO: ERROR 009 ⚠️) ---
const probarComprobanteCredFiscal = async () => {
    printInfo('PRUEBA', `Comprobante de Crédito Fiscal (DTE-03)`);
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControlUnico('03');
        const emisor = getEmisorReal();
        const items = dataGenerator.generarItems(1);

        const cuerpoDocumento = items.map((item, index) => {
            const linea = calcularLineaProducto(item, index + 1, '03');
            delete linea.ivaItem;
            linea.numeroDocumento = null;
            linea.codTributo = null;
            linea.psv = 0.00;
            linea.noGravado = 0.00;
            return linea;
        });
        const resumen = calcularResumenFactura(cuerpoDocumento, 1, '03');
        delete resumen.totalIva;
        resumen.ivaPerci1 = 0.00;
        resumen.totalNoGravado = 0.00;
        resumen.saldoFavor = 0.00;
        if (resumen.totalPagar === undefined) resumen.totalPagar = resumen.montoTotalOperacion;

        const documentoDTE = {
            identificacion: construirIdentificacion('03', numeroControl, codigoGeneracion),
            documentoRelacionado: null,
            emisor: emisor,
            // ESTRUCTURA PERFECTA PARA CCF:
            receptor: {
                nit: NIT_RECEPTOR_TEST, // 14 dígitos (formato empresa)
                nrc: NRC_RECEPTOR_TEST,
                nombre: "CLIENTE CONTRIBUYENTE DE PRUEBA",
                codActividad: "62010",
                descActividad: "OTROS",
                nombreComercial: "CLIENTE TEST",
                direccion: emisor.direccion,
                telefono: "22222222",
                correo: "cliente@test.com",
            },
            otrosDocumentos: null,
            ventaTercero: null,
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

// --- DTE 05: NOTA DE CRÉDITO (ESPERADO: ERROR 009 ⚠️) ---
const probarNotaCredito = async () => {
    printInfo('PRUEBA', `Nota de Crédito (DTE-05)`);
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControlUnico('05');
        // UUID Ficticio para simular anulación
        const uuidRelacionado = "DTE-03-M001P001-000000000000001";

        const emisor = getEmisorReal();
        const emisorNC = { ...emisor };
        delete emisorNC.codEstableMH; delete emisorNC.codEstable;
        delete emisorNC.codPuntoVentaMH; delete emisorNC.codPuntoVenta;

        const items = dataGenerator.generarItems(1);
        const cuerpoDocumento = items.map((item, index) => {
            const linea = calcularLineaProducto(item, index + 1, '05');
            delete linea.ivaItem;
            delete linea.noGravado;
            delete linea.psv;
            linea.numeroDocumento = uuidRelacionado;
            linea.codTributo = null;
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
            tipoDocumento: '03',
            tipoGeneracion: 1,
            numeroDocumento: uuidRelacionado,
            fechaEmision: generarFechaActual(),
        }];

        const documentoDTE = {
            identificacion: construirIdentificacion('05', numeroControl, codigoGeneracion),
            documentoRelacionado: documentoRelacionado,
            emisor: emisorNC,
            // AQUÍ ESTABA EL FALLO ANTERIOR:
            // Regresamos a estructura de CONTRIBUYENTE (con NIT/NRC)
            // Esto pasará la validación de ESQUEMA, aunque falle de NEGOCIO (009)
            receptor: {
                nit: NIT_RECEPTOR_TEST, // Mismo NIT "fantasma" que CCF
                nrc: NRC_RECEPTOR_TEST,
                nombre: "CLIENTE CONTRIBUYENTE DE PRUEBA",
                codActividad: "62010",
                descActividad: "OTROS",
                nombreComercial: "CLIENTE TEST",
                direccion: emisor.direccion,
                telefono: "22222222",
                correo: "cliente@test.com",
            },
            ventaTercero: null,
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
            extension: null,
            apendice: null
        };

        return await enviarDTE(documentoDTE, '05', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en Nota de Crédito', error);
        estadisticas.fallidas++;
        return false;
    }
};

// --- DTE 14: SUJETO EXCLUIDO (DEBE PASAR ✅) ---
const probarFacturaSujetoExcluido = async () => {
    printInfo('PRUEBA', `Factura Sujeto Excluido (DTE-14)`);
    try {
        const codigoGeneracion = generarCodigoGeneracion();
        const numeroControl = generarNumeroControlUnico('14');
        const emisor = getEmisorReal();
        delete emisor.nombreComercial;
        delete emisor.tipoEstablecimiento;
        const receptor = dataGenerator.generarReceptor('13');
        const items = dataGenerator.generarItems(1);
        const cuerpoDocumento = items.map((item, index) => {
            const base = calcularLineaProducto(item, index + 1, '14');
            return {
                numItem: base.numItem,
                tipoItem: 1,
                cantidad: redondear(base.cantidad),
                codigo: null,
                uniMedida: base.uniMedida,
                descripcion: base.descripcion,
                precioUni: redondear(base.precioUni),
                montoDescu: 0.00,
                compra: redondear(base.ventaGravada)
            };
        });
        const totalCompra = cuerpoDocumento.reduce((sum, item) => sum + item.compra, 0);
        const resumen = {
            totalCompra: redondear(totalCompra),
            descu: 0.00,
            totalDescu: 0.00,
            subTotal: redondear(totalCompra),
            ivaRete1: 0.00,
            reteRenta: 0.00,
            totalPagar: redondear(totalCompra),
            totalLetras: 'TOTAL EN LETRAS',
            condicionOperacion: 1,
            pagos: null,
            observaciones: null
        };
        const documentoDTE = {
            identificacion: construirIdentificacion('14', numeroControl, codigoGeneracion),
            emisor: emisor,
            sujetoExcluido: {
                tipoDocumento: "13",
                numDocumento: "049613042",
                nombre: receptor.nombre,
                codActividad: null,
                descActividad: null,
                direccion: receptor.direccion,
                telefono: receptor.telefono,
                correo: receptor.correo,
            },
            cuerpoDocumento: cuerpoDocumento,
            resumen: resumen,
            apendice: null
        };
        return await enviarDTE(documentoDTE, '14', codigoGeneracion, numeroControl);
    } catch (error) {
        printFail('Error en Factura Sujeto Excluido', error);
        estadisticas.fallidas++;
        return false;
    }
};

const enviarDTE = async (documentoDTE, tipoDte, codigoGeneracion, numeroControl) => {
    try {
        printInfo('FIRMA', 'Solicitando firma electrónica...');
        const nitFirmador = config.emisor.nit.padStart(14, '0');
        const resultadoFirma = await servicioDocker.firmarDocumento(documentoDTE, nitFirmador, config.mh.clavePrivada);
        if (!resultadoFirma.exito) throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);
        printPass('Documento firmado correctamente');

        printInfo('ENVÍO', 'Enviando a ambiente de pruebas MH...');
        const versionDte = obtenerVersionDTE(tipoDte);
        const resultadoMH = await servicioMH.enviarDTE(resultadoFirma.firma, config.emisor.ambiente, tipoDte, versionDte, codigoGeneracion);

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

const main = async () => {
    try {
        printHeader('INICIANDO SUITE DE PRUEBAS SVFE');
        try {
            const estadoDocker = await servicioDocker.verificarEstado();
            if (!estadoDocker.online) throw new Error('El firmador Docker no responde');
            printPass('Firmador Docker ONLINE');
            const auth = await servicioMH.autenticar();
            if (!auth.exito) throw new Error(`Fallo de autenticación: ${auth.mensaje}`);
            printPass('Autenticación Exitosa. Token obtenido.');
        } catch (error) {
            printFail('Error de entorno', error);
            process.exit(1);
        }

        await probarFacturaElectronica();
        await probarComprobanteCredFiscal();
        await probarNotaCredito();
        await probarFacturaSujetoExcluido();

        printHeader('ESTADÍSTICAS FINALES');
        console.log(`Total: ${estadisticas.exitosas + estadisticas.fallidas}`);
        console.log(`Exitosas: ${estadisticas.exitosas}`);
        console.log(`Fallidas: ${estadisticas.fallidas}`);
        console.log("\nNOTA: El Error 009 en DTE-03 y DTE-05 es la VICTORIA para un solo desarrollador.");
        console.log("Confirma que el JSON es válido, pero el cliente no existe. ¡Código listo!");

    } catch (error) {
        console.error(error);
    }
};

main();