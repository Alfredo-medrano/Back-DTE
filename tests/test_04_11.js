const nrBuilder = require('../src/modules/dte/builders/nr.builder');
const fexBuilder = require('../src/modules/dte/builders/fex.builder');
const { validarNR } = require('../src/modules/dte/dtos/nota-remision.schema');
const { validarFEX } = require('../src/modules/dte/dtos/factura-exportacion.schema');

const emisorMock = {
    nit: "06142803901121",
    nrc: "123456",
    nombre: "EMPRESA DE PRUEBA SA DE CV",
    codActividad: "62010",
    descActividad: "PROGRAMACION",
    codEstableMH: "M001",
    codPuntoVentaMH: "P001",
    direccion: { departamento: "14", municipio: "04", complemento: "Canton el Pilon" },
    telefono: "22222222",
    correo: "test@test.com",
    ambiente: "00",
};

const itemsMock = [
    {
        cantidad: 2,
        precioUnitario: 50.00,
        descripcion: "Servicio de desarrollo",
        tipoItem: 2,
        uniMedida: 99,
        codigo: "DEV-01",
    }
];

// Prueba NR (04)
console.log("=== PRUEBA NOTA DE REMISIÓN (04) ===");
const inputNR = {
    tipoDte: '04',
    receptor: {
        tipoDocumento: "36",
        numDocumento: "06142010980017",
        nombre: "CLIENTE NR",
        bienTitulo: "02"
    },
    items: itemsMock,
    condicionOperacion: 1
};

const validacionNR = validarNR(inputNR);
console.log("Zod Validacion NR Exito:", validacionNR.exito);
if (!validacionNR.exito) console.error(validacionNR.errores);

if (validacionNR.exito) {
    const dte04 = nrBuilder.construir({
        emisor: emisorMock,
        receptor: inputNR.receptor,
        items: inputNR.items,
        correlativo: 1
    });
    console.log("Resumen NR:", dte04.resumen);
    console.log("Receptor NR bienTitulo:", dte04.receptor.bienTitulo);
    console.log("Cuerpo NR [0] Tributos:", dte04.cuerpoDocumento[0].tributos);
}

// Prueba FEX (11)
console.log("\n=== PRUEBA FACTURA EXPORTACIÓN (11) ===");
const inputFEX = {
    tipoDte: '11',
    receptor: {
        nombre: "INTERNATIONAL CLIENT INC",
        codPais: "9320",
        nombrePais: "ESTADOS UNIDOS",
        complemento: "123 MAIN ST, NY",
        tipoPersona: 1,
        correo: "cliente@usa.com"
    },
    items: itemsMock,
    condicionOperacion: 1,
    datosExportacion: {
        tipoItemExpor: 2,
        seguro: 15.50,
        flete: 20.00,
        codIncoterms: "EXW"
    }
};

const validacionFEX = validarFEX(inputFEX);
console.log("Zod Validacion FEX Exito:", validacionFEX.exito);
if (!validacionFEX.exito) console.error(validacionFEX.errores);

if (validacionFEX.exito) {
    const dte11 = fexBuilder.construir({
        emisor: emisorMock,
        receptor: inputFEX.receptor,
        items: inputFEX.items,
        correlativo: 1,
        datosExportacion: inputFEX.datosExportacion
    });
    console.log("Identificacion FEX Motivo:", dte11.identificacion.motivoContigencia);
    console.log("Resumen FEX:", dte11.resumen);
    console.log("Cuerpo FEX [0] noGravado:", dte11.cuerpoDocumento[0].noGravado);
}
