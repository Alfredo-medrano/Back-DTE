/**
 * ========================================
 * BOMBARDEO DTE-03 (CRÉDITO FISCAL) - V4 DATOS REALES
 * ========================================
 * Objetivo: Generar 75 CCF con datos válidos proporcionados por el usuario.
 */

const servicioDocker = require('../src/services/servicioDocker');
const servicioMH = require('../src/services/servicioMH');
const { generarCodigoGeneracion, generarFechaActual, generarHoraEmision } = require('../src/utils/generadorUUID');
const { obtenerVersionDTE } = require('../src/config/tiposDTE');
const config = require('../src/config/env');

const CANTIDAD = 75;
const PAUSA_MS = 1500;

// Configuración del Emisor
const getEmisor = () => ({
    nit: config.emisor.nit || "070048272",
    nrc: "3799647",
    nombre: "ALFREDO EZEQUIEL MEDRANO MARTINEZ",
    codActividad: "62010",
    descActividad: "PROGRAMACION INFORMATICA",
    nombreComercial: "ALFREDO MEDRANO",
    tipoEstablecimiento: "01",
    direccion: { departamento: "14", municipio: "04", complemento: "CANTON EL PILON" },
    telefono: "22222222",
    correo: "test@test.com",
    codEstableMH: "M001", codEstable: "M001", codPuntoVentaMH: "P001", codPuntoVenta: "P001"
});

// Configuración del Receptor (TUS DATOS NUEVOS)
const getReceptor = () => ({
    // Usamos el NIT completo del intento anterior (el que pasaste ahora parece parcial)
    nit: "12172305071014",
    // Nuevo NRC (Sin guion, el esquema solo acepta números)
    nrc: "1799460",
    nombre: "RECEPTOR DE PRUEBAS SANDBOX",
    codActividad: "10005",
    descActividad: "OTROS",
    nombreComercial: "EMPRESA DE PRUEBAS",
    direccion: { departamento: "06", municipio: "14", complemento: "SAN SALVADOR" },
    telefono: "22222222",
    correo: "receptor@test.com"
});

const generarNumeroControl = (i) => {
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const timestampPart = Date.now().toString().slice(-12);
    return `DTE-03-M001P001-${timestampPart}${randomSuffix}`;
};

const main = async () => {
    console.log(`🚀 INICIANDO BOMBARDEO DE ${CANTIDAD} CRÉDITOS FISCALES (DTE-03)...`);
    console.log(`🎯 Receptor: NIT 12172305071014 / NRC 1799460`);

    const auth = await servicioMH.autenticar();
    if (!auth.exito) {
        console.error("❌ Fallo autenticación");
        return;
    }

    for (let i = 1; i <= CANTIDAD; i++) {
        const codGen = generarCodigoGeneracion();

        const precioNeto = 100.00;
        const ventaGravada = precioNeto;
        const valorIVA = 13.00;
        const totalOperacion = 113.00;

        const dte = {
            identificacion: {
                version: 3,
                ambiente: config.emisor.ambiente,
                tipoDte: "03",
                numeroControl: generarNumeroControl(i),
                codigoGeneracion: codGen,
                tipoModelo: 1,
                tipoOperacion: 1,
                fecEmi: generarFechaActual(),
                horEmi: generarHoraEmision(),
                tipoMoneda: "USD",
                tipoContingencia: null,
                motivoContin: null
            },
            documentoRelacionado: null,
            emisor: getEmisor(),
            receptor: getReceptor(),
            otrosDocumentos: null,
            ventaTercero: null,
            cuerpoDocumento: [
                {
                    numItem: 1,
                    tipoItem: 1,
                    numeroDocumento: null,
                    cantidad: 1,
                    codigo: "SERV01",
                    codTributo: null,
                    uniMedida: 59,
                    descripcion: "SERVICIOS PROFESIONALES",
                    precioUni: precioNeto,
                    montoDescu: 0,
                    ventaNoSuj: 0,
                    ventaExenta: 0,
                    ventaGravada: ventaGravada,
                    tributos: ["20"],
                    psv: 0,
                    noGravado: 0
                }
            ],
            resumen: {
                totalNoSuj: 0,
                totalExenta: 0,
                totalGravada: ventaGravada,
                subTotalVentas: ventaGravada,
                descuNoSuj: 0,
                descuExenta: 0,
                descuGravada: 0,
                porcentajeDescuento: 0,
                totalDescu: 0,
                tributos: [
                    {
                        codigo: "20",
                        descripcion: "Impuesto al Valor Agregado 13%",
                        valor: valorIVA
                    }
                ],
                subTotal: ventaGravada,
                ivaPerci1: 0,
                ivaRete1: 0,
                reteRenta: 0,
                montoTotalOperacion: totalOperacion,
                totalNoGravado: 0,
                totalPagar: totalOperacion,
                totalLetras: "CIENTO TRECE 00/100 USD",
                saldoFavor: 0,
                condicionOperacion: 1,
                pagos: null,
                numPagoElectronico: null
            },
            extension: null,
            apendice: null
        };

        process.stdout.write(`[${i}/${CANTIDAD}] Env: `);

        try {
            const nitFirmador = config.emisor.nit.padStart(14, '0');
            const firma = await servicioDocker.firmarDocumento(dte, nitFirmador, config.mh.clavePrivada);

            if (firma.exito) {
                const res = await servicioMH.enviarDTE(firma.firma, config.emisor.ambiente, "03", 3, codGen);
                if (res.exito) {
                    console.log(`✅ OK - ${codGen}`);
                } else {
                    console.log(`❌ ERROR MH`);
                    if (res.observaciones) console.log(JSON.stringify(res.observaciones));
                    if (res.descripcionMsg) console.log(res.descripcionMsg);
                }
            } else {
                console.log(`❌ ERROR FIRMA: ${firma.error}`);
            }
        } catch (error) {
            console.log(`❌ EXCEPCION: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, PAUSA_MS));
    }
    console.log("\n🏁 BOMBARDEO FINALIZADO.");
};

main();