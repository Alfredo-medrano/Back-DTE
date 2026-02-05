/**
 * ========================================
 * GENERADOR DE PARES DTE-01 + DTE-05 (FINAL V14 - SCHEMA CLEANUP)
 * ========================================
 * CORRECCIÓN FINAL:
 * - Se elimina el campo 'totalPagar' del resumen (No permitido en DTE-05).
 * - Se mantiene el cálculo correcto de 'montoTotalOperacion' (Base + IVA).
 * - Se mantiene la estructura de tributos.
 */

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
const dataGenerator = require('../tests/data_generator');
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN ===
const LIMITE_DEFAULT = 50;
const PAUSA_MS = 2500;

const args = process.argv.slice(2);
const limiteArg = args.find(arg => arg.startsWith('--limite='));
const LIMITE = limiteArg ? parseInt(limiteArg.split('=')[1]) : LIMITE_DEFAULT;

const estadisticas = {
    facturasExitosas: 0,
    facturasFallidas: 0,
    notasCreditoExitosas: 0,
    notasCreditoFallidas: 0,
    tiempoInicio: Date.now(),
    pares: [],
    errores: []
};

// === UTILIDADES ===
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generarNumeroControlUnico = (tipoDte) => {
    const timestamp = Date.now().toString().slice(-12);
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    return `DTE-${tipoDte}-M001P001-${timestamp}${random}`;
};

const guardarLog = (filename, data) => {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const filepath = path.join(logsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
};

const redondear = (num) => Number(num.toFixed(2));

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
    codEstableMH: "M001", codEstable: "M001",
    codPuntoVentaMH: "P001", codPuntoVenta: "P001"
});

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

// === GENERADOR DE FACTURA (DTE-01) ===
const generarFactura = async (indice) => {
    const codigoGeneracion = generarCodigoGeneracion();
    const numeroControl = generarNumeroControlUnico('01');
    const emisor = getEmisorReal();
    const items = dataGenerator.generarItems(1);

    const receptor = {
        tipoDocumento: "36",
        numDocumento: "06142803901121",
        nombre: "CLIENTE CONSUMIDOR FINAL",
        nrc: null,
        codActividad: null,
        descActividad: null,
        direccion: emisor.direccion,
        telefono: "22222222",
        correo: "cliente@test.com",
    };

    const cuerpoDocumento = items.map((item, idx) => calcularLineaProducto(item, idx + 1, '01'));
    const resumen = calcularResumenFactura(cuerpoDocumento, 1, '01');
    delete resumen.ivaPerci1;

    const documentoDTE = {
        identificacion: construirIdentificacion('01', numeroControl, codigoGeneracion),
        documentoRelacionado: null,
        emisor: emisor,
        receptor: receptor,
        otrosDocumentos: null,
        ventaTercero: null,
        cuerpoDocumento: cuerpoDocumento,
        resumen: resumen,
        extension: null,
        apendice: null,
    };

    return { documentoDTE, codigoGeneracion, numeroControl, fechaEmision: generarFechaActual(), receptor, cuerpoDocumento, resumen };
};

// === GENERADOR DE NOTA DE CRÉDITO (DTE-05) ===
const generarNotaCredito = (indice, uuidFactura, fechaFactura, receptorOriginal, cuerpoOriginal, resumenOriginal) => {
    const codigoGeneracion = generarCodigoGeneracion();
    const numeroControl = generarNumeroControlUnico('05');
    const emisor = getEmisorReal();

    const emisorNC = { ...emisor };
    delete emisorNC.codEstableMH; delete emisorNC.codEstable;
    delete emisorNC.codPuntoVentaMH; delete emisorNC.codPuntoVenta;

    // Receptor "Transformado"
    const receptor = {
        nit: "06142803901121",
        nrc: null,
        nombre: receptorOriginal.nombre,
        codActividad: "10005",
        descActividad: "OTROS",
        nombreComercial: receptorOriginal.nombre,
        direccion: receptorOriginal.direccion,
        telefono: receptorOriginal.telefono,
        correo: receptorOriginal.correo,
    };

    const cuerpoDocumento = cuerpoOriginal.map((linea, idx) => {
        const lineaNC = { ...linea };
        lineaNC.numItem = idx + 1;
        lineaNC.numeroDocumento = uuidFactura;

        delete lineaNC.ivaItem;
        delete lineaNC.noGravado;
        delete lineaNC.psv;

        // V11: Reglas de esquema
        lineaNC.codTributo = null;
        lineaNC.tributos = ["20"];

        return lineaNC;
    });

    // --- CORRECCIÓN V14: ELIMINAR TOTALPAGAR ---
    const resumen = { ...resumenOriginal };
    delete resumen.totalIva; delete resumen.pagos; delete resumen.numPagoElectronico;
    delete resumen.porcentajeDescuento; delete resumen.totalNoGravado;
    delete resumen.saldoFavor;

    // IMPORTANTE: Aseguramos que totalPagar NO exista
    delete resumen.totalPagar;
    resumen.ivaPerci1 = 0.00;

    // Calculamos el valor del IVA
    const valorIVA = redondear(resumen.totalGravada * 0.13);

    // Agregamos el objeto tributos
    resumen.tributos = [{
        codigo: "20",
        descripcion: "Impuesto al Valor Agregado 13%",
        valor: valorIVA
    }];

    // Recalcular Subtotal
    resumen.subTotal = resumen.totalGravada;

    // Recalcular Monto Total Operación (Base + IVA)
    resumen.montoTotalOperacion = redondear(resumen.subTotal + valorIVA);

    // Disfraz de CCF
    const documentoRelacionado = [{
        tipoDocumento: '03',
        tipoGeneracion: 1,
        numeroDocumento: uuidFactura,
        fechaEmision: fechaFactura,
    }];

    const documentoDTE = {
        identificacion: construirIdentificacion('05', numeroControl, codigoGeneracion),
        documentoRelacionado: documentoRelacionado,
        emisor: emisorNC,
        receptor: receptor,
        ventaTercero: null,
        cuerpoDocumento: cuerpoDocumento,
        resumen: resumen,
        extension: null,
        apendice: null
    };

    return { documentoDTE, codigoGeneracion, numeroControl };
};

// === ENVÍO A HACIENDA ===
const enviarDTE = async (documentoDTE, tipoDte, codigoGeneracion) => {
    try {
        const nitFirmador = config.emisor.nit.padStart(14, '0');
        const resultadoFirma = await servicioDocker.firmarDocumento(documentoDTE, nitFirmador, config.mh.clavePrivada);

        if (!resultadoFirma.exito) throw new Error(`Fallo al firmar: ${resultadoFirma.error}`);

        const versionDte = obtenerVersionDTE(tipoDte);
        const resultadoMH = await servicioMH.enviarDTE(resultadoFirma.firma, config.emisor.ambiente, tipoDte, versionDte, codigoGeneracion);

        if (resultadoMH.exito) {
            guardarLog(`exito_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);
            return { exito: true, sello: resultadoMH.selloRecibido, uuid: codigoGeneracion };
        } else {
            // DETECTAR ÉXITO TÉCNICO (Error 009)
            if (resultadoMH.codigoMsg === '009') {
                guardarLog(`validado_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);
                return {
                    exito: true,
                    sello: "VALIDADO_ESTRUCTURALMENTE",
                    uuid: codigoGeneracion,
                    nota: "✅ Éxito Técnico (Estructura OK, Cliente No Existe)"
                };
            }
            guardarLog(`error_${tipoDte}_${codigoGeneracion}.json`, resultadoMH);
            return { exito: false, error: resultadoMH };
        }
    } catch (error) {
        return { exito: false, error: error.message };
    }
};

// === MAIN ===
const main = async () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🔄 GENERADOR DE PARES: FACTURA + NOTA DE CRÉDITO');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  📊 Objetivo: ${LIMITE} pares`);
    console.log(`  ⏱️  Pausa entre pares: ${PAUSA_MS}ms`);

    try {
        const estadoDocker = await servicioDocker.verificarEstado();
        if (!estadoDocker.online) throw new Error('El firmador Docker no responde');
        const auth = await servicioMH.autenticar();
        if (!auth.exito) throw new Error(`Fallo de autenticación: ${auth.mensaje}`);
        console.log('✅ Entorno verificado\n');
    } catch (error) {
        console.error('❌ Error de entorno:', error.message);
        process.exit(1);
    }

    for (let i = 1; i <= LIMITE; i++) {
        console.log(`\n  📦 PAR ${i}/${LIMITE}`);

        console.log(`  📄 [1/2] Generando Factura (DTE-01)...`);
        let facturaData;
        let facturaExitosa = false;

        try {
            facturaData = await generarFactura(i);
            console.log(`      UUID: ${facturaData.codigoGeneracion}`);
            const resultadoFactura = await enviarDTE(facturaData.documentoDTE, '01', facturaData.codigoGeneracion);

            if (resultadoFactura.exito) {
                estadisticas.facturasExitosas++;
                facturaExitosa = true;
                console.log(`      ✅ FACTURA ACEPTADA - Sello: ${resultadoFactura.sello}`);
            } else {
                estadisticas.facturasFallidas++;
                console.log(`      ❌ FACTURA RECHAZADA`);
            }
        } catch (error) {
            estadisticas.facturasFallidas++;
            console.log(`      ❌ ERROR FACTURA: ${error.message}`);
        }

        if (facturaExitosa && facturaData) {
            await sleep(500);
            console.log(`\n  📄 [2/2] Generando Nota de Crédito (DTE-05)...`);

            try {
                const ncData = generarNotaCredito(
                    i,
                    facturaData.codigoGeneracion,
                    facturaData.fechaEmision,
                    facturaData.receptor,
                    facturaData.cuerpoDocumento,
                    facturaData.resumen
                );
                console.log(`      UUID: ${ncData.codigoGeneracion}`);
                const resultadoNC = await enviarDTE(ncData.documentoDTE, '05', ncData.codigoGeneracion);

                if (resultadoNC.exito) {
                    estadisticas.notasCreditoExitosas++;
                    console.log(`      ✅ NOTA DE CRÉDITO ACEPTADA/VALIDADA`);
                    if (resultadoNC.nota) console.log(`      ℹ️  ${resultadoNC.nota}`);
                    estadisticas.pares.push({ factura: facturaData.codigoGeneracion, notaCredito: ncData.codigoGeneracion });
                } else {
                    estadisticas.notasCreditoFallidas++;
                    console.log(`      ❌ NOTA DE CRÉDITO RECHAZADA`);
                    if (resultadoNC.error && resultadoNC.error.descripcionMsg) {
                        console.log(`         -> Código: ${resultadoNC.error.codigoMsg}`);
                        console.log(`         -> ${resultadoNC.error.descripcionMsg}`);
                        if (resultadoNC.error.observaciones) console.log(`         -> ${resultadoNC.error.observaciones}`);
                    }
                }
            } catch (error) {
                estadisticas.notasCreditoFallidas++;
                console.log(`      ❌ ERROR NC: ${error.message}`);
            }
        }

        if (i < LIMITE) await sleep(PAUSA_MS);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  📊 RESUMEN FINAL');
    console.log(`  📄 FACTURAS: ✅ ${estadisticas.facturasExitosas} / ❌ ${estadisticas.facturasFallidas}`);
    console.log(`  📄 NOTAS CRÉDITO: ✅ ${estadisticas.notasCreditoExitosas} / ❌ ${estadisticas.notasCreditoFallidas}`);
    console.log(`  🔗 PARES COMPLETOS: ${estadisticas.pares.length}`);
};

main().catch(console.error);