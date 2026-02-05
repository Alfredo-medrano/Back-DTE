/**
 * ========================================
 * FINALIZADOR DTE-14 (SUJETO EXCLUIDO) - V2 CORREGIDO
 * ========================================
 * CORRECCIONES APLICADAS SEGÚN LOG DE ERROR:
 * 1. numControl: Ajustado a 31 caracteres exactos (DTE-14 + 8 codigos + 15 correlativo).
 * 2. identificacion: Se agregaron campos obligatorios 'tipoContingencia' y 'motivoContin' (null).
 * 3. emisor: Se ELIMINÓ 'tipoEstablecimiento' (No permitido en DTE-14).
 * 4. sujetoExcluido: Se agregaron 'codActividad' y 'descActividad'.
 */

const servicioDocker = require('../src/services/servicioDocker');
const servicioMH = require('../src/services/servicioMH');
const { generarCodigoGeneracion, generarFechaActual, generarHoraEmision } = require('../src/utils/generadorUUID');
const { calcularLineaProducto } = require('../src/utils/calculadorIVA');
const config = require('../src/config/env');
const dataGenerator = require('../tests/data_generator');

const CANTIDAD = 15;
const PAUSA_MS = 2000; // Pausa segura

const getEmisor = () => ({
    nit: config.emisor.nit || "070048272",
    nrc: "3799647",
    nombre: "ALFREDO EZEQUIEL MEDRANO MARTINEZ",
    codActividad: "62010",
    descActividad: "PROGRAMACION INFORMATICA",
    // NOTA: tipoEstablecimiento SE ELIMINA MÁS ABAJO
    tipoEstablecimiento: "01",
    direccion: { departamento: "14", municipio: "04", complemento: "CANTON EL PILON" },
    telefono: "22222222",
    correo: "test@test.com",
    codEstableMH: "M001", codEstable: "M001", codPuntoVentaMH: "P001", codPuntoVenta: "P001"
});

// Función para generar número de control EXACTO de 31 caracteres
// Estructura: DTE-14 (6) + M001P001 (8) + Correlativo (15) = 29 ?? No, DTE-14- es 7 chars.
// DTE-14- (7) + M001P001 (8) + 000000000000001 (15) = 30? Espera, revisemos patrón.
// Patrón oficial: ^DTE-14-[A-Z0-9]{8}-[0-9]{15}$
// DTE-14- (7 chars) + M001P001 (8 chars) + - (1 char) + 15 digitos = 31 chars.
const generarNumeroControl = (i) => {
    const correlativo = i.toString().padStart(15, '0');
    return `DTE-14-M001P001-${correlativo}`;
};

const main = async () => {
    console.log(`🚀 GENERANDO ${CANTIDAD} SUJETOS EXCLUIDOS (CORREGIDO)...`);
    await servicioMH.autenticar();

    for (let i = 1; i <= CANTIDAD; i++) {
        const codGen = generarCodigoGeneracion();

        // 1. Preparar Emisor y LIMPIAR campos prohibidos
        const emisor = getEmisor();
        delete emisor.tipoEstablecimiento; // <--- CORRECCIÓN CRÍTICA: NO PERMITIDO EN DTE-14
        delete emisor.nombreComercial;     // Por si acaso

        // 2. Cuerpo
        const cuerpo = [{
            numItem: 1,
            tipoItem: 1,
            cantidad: 1,
            codigo: null,
            uniMedida: 59,
            descripcion: "SERVICIO DE LIMPIEZA",
            precioUni: 100.00,
            montoDescu: 0,
            compra: 100.00
        }];

        const dte = {
            identificacion: {
                version: 1,
                ambiente: config.emisor.ambiente,
                tipoDte: "14",
                numeroControl: generarNumeroControl(i), // <--- CORRECCIÓN: 31 CHARS EXACTOS
                codigoGeneracion: codGen,
                tipoModelo: 1,
                tipoOperacion: 1,
                fecEmi: generarFechaActual(),
                horEmi: generarHoraEmision(),
                tipoMoneda: "USD",
                // CORRECCIÓN: CAMPOS NULL OBLIGATORIOS
                tipoContingencia: null,
                motivoContin: null
            },
            emisor: emisor,
            sujetoExcluido: {
                tipoDocumento: "13", // DUI
                numDocumento: "049613042",
                nombre: "JUAN PEREZ",
                // CORRECCIÓN: ACTIVIDAD REQUERIDA
                codActividad: "10005",
                descActividad: "OTROS",
                direccion: emisor.direccion,
                telefono: "22222222",
                correo: "juan@test.com"
            },
            cuerpoDocumento: cuerpo,
            resumen: {
                totalCompra: 100.00,
                descu: 0,
                totalDescu: 0,
                subTotal: 100.00,
                ivaRete1: 0,
                reteRenta: 0,
                totalPagar: 100.00,
                totalLetras: "CIEN 00/100 USD",
                condicionOperacion: 1,
                pagos: null,
                observaciones: null
            },
            apendice: null
        };

        // Firmar y Enviar
        const nitFirmador = config.emisor.nit.padStart(14, '0');
        const firma = await servicioDocker.firmarDocumento(dte, nitFirmador, config.mh.clavePrivada);

        if (firma.exito) {
            const res = await servicioMH.enviarDTE(firma.firma, config.emisor.ambiente, "14", 1, codGen);
            if (res.exito) {
                console.log(`✅ DTE-14 #${i} ACEPTADO - ${codGen}`);
            } else {
                console.log(`❌ DTE-14 #${i} RECHAZADO`);
                // Imprimir error limpio
                if (res.observaciones) console.log(JSON.stringify(res.observaciones, null, 2));
                else if (res.descripcionMsg) console.log(res.descripcionMsg);
            }
        } else {
            console.log(`❌ Error Firma: ${firma.error}`);
        }
        await new Promise(r => setTimeout(r, PAUSA_MS));
    }
    console.log("🏁 PROCESO TERMINADO");
};

main();