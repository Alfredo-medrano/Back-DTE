/**
 * ========================================
 * TEST: Validación de Output DTE vs Golden JSONs
 * ========================================
 * Compara campo por campo la salida de los builders FE-01 y CCF-03
 * contra las estructuras exactas aceptadas por el MH.
 *
 * Ejecutar: node tests/test_builder_output.js
 */

const { construirDocumento } = require('../src/modules/dte/builders');
const { sanitizarParaMH } = require('../src/modules/dte/builders/sanitize-for-mh');

// ═══════════════════════════════════════
// DATOS DE PRUEBA (mismos que los golden JSONs)
// ═══════════════════════════════════════

const emisorPrueba = {
    nit: '06140101901011',
    nrc: '123456-7',
    nombre: 'TUFACTURATECH SA DE CV',
    codActividad: '62020',
    descActividad: 'Consultoría en informática',
    nombreComercial: 'TUFACTURATECH',
    tipoEstablecimiento: '01',
    departamento: '06',
    municipio: '14',
    complemento: 'Edificio Principal, Local 1',
    telefono: '22222222',
    correo: 'facturacion@tufacturatech.com',
    codEstableMH: null,
    codEstable: '0001',
    codPuntoVentaMH: null,
    codPuntoVenta: '0001',
    ambiente: '00',
};

const receptorFE = {
    tipoDocumento: '13',
    numDocumento: '12345678-9',
    nombre: 'JUAN PEREZ',
    codActividad: '10005',
    descActividad: 'Otros',
    direccion: {
        departamento: '06',
        municipio: '14',
        complemento: 'Residencial Las Flores',
    },
    telefono: '77777777',
    correo: 'cliente@email.com',
};

const receptorCCF = {
    nit: '06141111111111',
    nrc: '765432-1',
    nombre: 'EMPRESA CLIENTE SA DE CV',
    codActividad: '46900',
    descActividad: 'Comercio al por mayor',
    nombreComercial: 'EL CLIENTE',
    direccion: {
        departamento: '06',
        municipio: '14',
        complemento: 'Avenida Los Próceres',
    },
    telefono: '23333333',
    correo: 'pagos@empresacliente.com',
};

// FE: Precio con IVA = $11.30 (base $10.00 + 13% = $11.30)
const itemsFE = [{
    tipoItem: 2,
    codigo: 'SRV-001',
    descripcion: 'Suscripción Mensual SaaS',
    cantidad: 1.00,
    precioUnitario: 11.30, // YA incluye IVA
}];

// CCF: Precio neto = $10.00 (sin IVA)
const itemsCCF = [{
    tipoItem: 2,
    codigo: 'SRV-001',
    descripcion: 'Suscripción Mensual SaaS',
    cantidad: 1.00,
    precioUnitario: 10.00, // SIN IVA
}];

// ═══════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════

let passed = 0;
let failed = 0;

const assert = (condition, testName, details = '') => {
    if (condition) {
        console.log(`  ✅ ${testName}`);
        passed++;
    } else {
        console.log(`  ❌ ${testName}`);
        if (details) console.log(`     → ${details}`);
        failed++;
    }
};

const assertField = (obj, path, expectedValue, testName) => {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined) {
            assert(false, testName, `Campo "${path}" no encontrado (nulo en "${key}")`);
            return;
        }
        // Handle array index notation like "cuerpoDocumento[0]"
        const match = key.match(/^(\w+)\[(\d+)\]$/);
        if (match) {
            current = current[match[1]];
            if (Array.isArray(current)) {
                current = current[parseInt(match[2])];
            } else {
                assert(false, testName, `"${match[1]}" no es un array`);
                return;
            }
        } else {
            current = current[key];
        }
    }
    
    if (typeof expectedValue === 'object' && expectedValue !== null) {
        assert(
            JSON.stringify(current) === JSON.stringify(expectedValue),
            testName,
            `Esperado: ${JSON.stringify(expectedValue)}, Recibido: ${JSON.stringify(current)}`
        );
    } else {
        assert(
            current === expectedValue,
            testName,
            `Esperado: ${JSON.stringify(expectedValue)}, Recibido: ${JSON.stringify(current)}`
        );
    }
};

const assertNotExists = (obj, path, testName) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current === null || current === undefined) {
            assert(true, testName); // No existe porque un padre no existe
            return;
        }
        current = current[keys[i]];
    }
    const lastKey = keys[keys.length - 1];
    assert(
        current === null || current === undefined || !(lastKey in current),
        testName,
        `Campo "${path}" NO debería existir pero tiene valor: ${JSON.stringify(current?.[lastKey])}`
    );
};

// ═══════════════════════════════════════
// TEST 1: FACTURA ELECTRÓNICA (DTE-01)
// ═══════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log('TEST: FACTURA ELECTRÓNICA (DTE-01) v1');
console.log('════════════════════════════════════════\n');

try {
    const docFE = sanitizarParaMH(construirDocumento('01', {
        emisor: emisorPrueba,
        receptor: receptorFE,
        items: itemsFE,
        correlativo: 1,
        condicionOperacion: 1,
    }));

    console.log('📋 Identificación:');
    assertField(docFE, 'identificacion.version', 1, 'version = 1');
    assertField(docFE, 'identificacion.tipoDte', '01', 'tipoDte = 01');
    assertField(docFE, 'identificacion.tipoModelo', 1, 'tipoModelo = 1');
    assertField(docFE, 'identificacion.tipoContingencia', null, 'tipoContingencia = null');
    assertField(docFE, 'identificacion.motivoContin', null, 'motivoContin = null');
    assertField(docFE, 'identificacion.tipoMoneda', 'USD', 'tipoMoneda = USD');

    console.log('\n📋 Documento relacionado:');
    assertField(docFE, 'documentoRelacionado', null, 'documentoRelacionado = null');

    console.log('\n📋 Emisor:');
    assertField(docFE, 'emisor.nit', '06140101901011', 'NIT = 14 dígitos');
    assertField(docFE, 'emisor.nrc', '123456-7', 'NRC correcto');
    assertField(docFE, 'emisor.codEstable', '0001', 'codEstable presente');
    assertField(docFE, 'emisor.codPuntoVenta', '0001', 'codPuntoVenta presente');

    console.log('\n📋 Receptor FE:');
    assertField(docFE, 'receptor.tipoDocumento', '13', 'tipoDocumento = 13 (DUI)');
    assertField(docFE, 'receptor.numDocumento', '12345678-9', 'numDocumento correcto');
    assertField(docFE, 'receptor.nrc', null, 'nrc = null (FE no requiere)');
    assertField(docFE, 'receptor.codActividad', '10005', 'codActividad del receptor');
    assertField(docFE, 'receptor.descActividad', 'Otros', 'descActividad del receptor');

    console.log('\n📋 Nodos nulos:');
    assertField(docFE, 'otrosDocumentos', null, 'otrosDocumentos = null');
    assertField(docFE, 'ventaTercero', null, 'ventaTercero = null');
    assertField(docFE, 'extension', null, 'extension = null');
    assertField(docFE, 'apendice', null, 'apendice = null');

    console.log('\n📋 CuerpoDocumento [0]:');
    const item0 = docFE.cuerpoDocumento[0];
    assertField(docFE, 'cuerpoDocumento[0].numItem', 1, 'numItem = 1');
    assertField(docFE, 'cuerpoDocumento[0].tipoItem', 2, 'tipoItem = 2 (servicio)');
    assertField(docFE, 'cuerpoDocumento[0].numeroDocumento', null, 'numeroDocumento = null');
    assertField(docFE, 'cuerpoDocumento[0].uniMedida', 99, 'uniMedida = 99 (servicio)');
    assertField(docFE, 'cuerpoDocumento[0].precioUni', 11.30, 'precioUni = 11.30 (con IVA)');
    assertField(docFE, 'cuerpoDocumento[0].ventaGravada', 11.30, 'ventaGravada = 11.30');
    assertField(docFE, 'cuerpoDocumento[0].tributos', null, 'tributos = null (FE-01)');
    assertField(docFE, 'cuerpoDocumento[0].psv', 0.00, 'psv = 0.00');
    assertField(docFE, 'cuerpoDocumento[0].noGravado', 0.00, 'noGravado = 0.00');
    assert(item0.ivaItem !== undefined, 'ivaItem EXISTE en FE-01');
    assert(item0.ivaItem === 1.30, 'ivaItem = 1.30', `Recibido: ${item0.ivaItem}`);

    console.log('\n📋 Resumen FE:');
    assertField(docFE, 'resumen.totalGravada', 11.30, 'totalGravada = 11.30');
    assertField(docFE, 'resumen.subTotalVentas', 11.30, 'subTotalVentas = 11.30');
    assertField(docFE, 'resumen.tributos', null, 'tributos = null (FE-01)');
    assertField(docFE, 'resumen.montoTotalOperacion', 11.30, 'montoTotalOperacion = 11.30');
    assertField(docFE, 'resumen.totalPagar', 11.30, 'totalPagar = 11.30');
    assertField(docFE, 'resumen.totalIva', 1.30, 'totalIva = 1.30');
    assertField(docFE, 'resumen.condicionOperacion', 1, 'condicionOperacion = 1');
    assertField(docFE, 'resumen.numPagoElectronico', null, 'numPagoElectronico = null');

    console.log('\n📋 Pagos FE:');
    assert(Array.isArray(docFE.resumen.pagos), 'pagos es un ARRAY (no null)');
    assert(docFE.resumen.pagos.length === 1, 'pagos tiene 1 elemento');
    assertField(docFE, 'resumen.pagos[0].codigo', '01', 'pagos[0].codigo = 01');
    assertField(docFE, 'resumen.pagos[0].montoPago', 11.30, 'pagos[0].montoPago = 11.30');
    assertField(docFE, 'resumen.pagos[0].referencia', null, 'pagos[0].referencia = null');
    assertField(docFE, 'resumen.pagos[0].plazo', null, 'pagos[0].plazo = null (contado)');
    assertField(docFE, 'resumen.pagos[0].periodo', null, 'pagos[0].periodo = null (contado)');

    console.log('\n📋 Campo ivaPerci1 NO debe existir en FE-01:');
    assertNotExists(docFE, 'resumen.ivaPerci1', 'ivaPerci1 NO existe en FE-01');

} catch (err) {
    console.log(`  💥 ERROR CONSTRUYENDO FE: ${err.message}`);
    failed++;
}

// ═══════════════════════════════════════
// TEST 2: CRÉDITO FISCAL (DTE-03)
// ═══════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log('TEST: CRÉDITO FISCAL (DTE-03) v3');
console.log('════════════════════════════════════════\n');

try {
    const docCCF = sanitizarParaMH(construirDocumento('03', {
        emisor: emisorPrueba,
        receptor: receptorCCF,
        items: itemsCCF,
        correlativo: 1,
        condicionOperacion: 1,
    }));

    console.log('📋 Identificación:');
    assertField(docCCF, 'identificacion.version', 3, 'version = 3');
    assertField(docCCF, 'identificacion.tipoDte', '03', 'tipoDte = 03');

    console.log('\n📋 Receptor CCF:');
    assertField(docCCF, 'receptor.nit', '06141111111111', 'NIT receptor directo');
    assertField(docCCF, 'receptor.nrc', '765432-1', 'NRC receptor obligatorio');
    assertField(docCCF, 'receptor.codActividad', '46900', 'codActividad');

    console.log('\n📋 CuerpoDocumento [0]:');
    const itemCCF0 = docCCF.cuerpoDocumento[0];
    assertField(docCCF, 'cuerpoDocumento[0].precioUni', 10.00, 'precioUni = 10.00 (SIN IVA)');
    assertField(docCCF, 'cuerpoDocumento[0].ventaGravada', 10.00, 'ventaGravada = 10.00');
    assert(JSON.stringify(itemCCF0.tributos) === JSON.stringify(['20']), 'tributos = ["20"]', `Recibido: ${JSON.stringify(itemCCF0.tributos)}`);
    assertNotExists(docCCF, 'cuerpoDocumento[0].ivaItem', 'ivaItem NO existe en CCF');

    console.log('\n📋 Resumen CCF:');
    assertField(docCCF, 'resumen.totalGravada', 10.00, 'totalGravada = 10.00');
    assertField(docCCF, 'resumen.subTotalVentas', 10.00, 'subTotalVentas = 10.00');
    assertField(docCCF, 'resumen.montoTotalOperacion', 11.30, 'montoTotalOperacion = 11.30 (10 + 1.30)');
    assertField(docCCF, 'resumen.totalPagar', 11.30, 'totalPagar = 11.30');
    assertField(docCCF, 'resumen.ivaPerci1', 0.00, 'ivaPerci1 = 0.00 (REQUERIDO en CCF)');
    assertNotExists(docCCF, 'resumen.totalIva', 'totalIva NO existe en CCF');

    console.log('\n📋 Tributos resumen CCF:');
    assert(Array.isArray(docCCF.resumen.tributos), 'tributos es un ARRAY');
    assert(docCCF.resumen.tributos.length === 1, 'tributos tiene 1 elemento');
    assertField(docCCF, 'resumen.tributos[0].codigo', '20', 'tributos[0].codigo = 20');
    assertField(docCCF, 'resumen.tributos[0].valor', 1.30, 'tributos[0].valor = 1.30');

    console.log('\n📋 Pagos CCF:');
    assert(Array.isArray(docCCF.resumen.pagos), 'pagos es un ARRAY (no null)');
    assertField(docCCF, 'resumen.pagos[0].codigo', '01', 'pagos[0].codigo = 01');
    assertField(docCCF, 'resumen.pagos[0].montoPago', 11.30, 'pagos[0].montoPago = 11.30');

} catch (err) {
    console.log(`  💥 ERROR CONSTRUYENDO CCF: ${err.message}`);
    failed++;
}

// ═══════════════════════════════════════
// TEST 3: SANITIZADOR
// ═══════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log('TEST: SANITIZADOR JSON');
console.log('════════════════════════════════════════\n');

const objConUndefined = {
    campo1: 'valor',
    campo2: null,
    campo3: undefined,
    anidado: {
        a: 1,
        b: undefined,
        c: null,
    },
    array: [
        { x: 1, y: undefined },
        { x: 2, z: null },
    ],
};

const sanitizado = sanitizarParaMH(objConUndefined);
assertField(sanitizado, 'campo1', 'valor', 'Preserva string');
assertField(sanitizado, 'campo2', null, 'Preserva null');
assertNotExists(sanitizado, 'campo3', 'Elimina undefined (raíz)');
assertField(sanitizado, 'anidado.a', 1, 'Preserva número anidado');
assertNotExists(sanitizado, 'anidado.b', 'Elimina undefined (anidado)');
assertField(sanitizado, 'anidado.c', null, 'Preserva null (anidado)');
assertNotExists(sanitizado, 'array[0].y', 'Elimina undefined (en array)');
assertField(sanitizado, 'array[1].z', null, 'Preserva null (en array)');

// ═══════════════════════════════════════
// TEST 4: VENTA A CRÉDITO SIN DATOS → ERROR
// ═══════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log('TEST: VALIDACIÓN CRÉDITO');
console.log('════════════════════════════════════════\n');

try {
    construirDocumento('01', {
        emisor: emisorPrueba,
        receptor: receptorFE,
        items: itemsFE,
        correlativo: 2,
        condicionOperacion: 2, // CRÉDITO sin plazo/periodo
    });
    assert(false, 'Debería lanzar error para crédito sin plazo/periodo');
} catch (err) {
    assert(
        err.message.includes('plazo') && err.message.includes('periodo'),
        'Error descriptivo para crédito sin datos de pago',
        err.message
    );
}

// ═══════════════════════════════════════
// TEST 5: VENTA A CRÉDITO CON DATOS → OK
// ═══════════════════════════════════════
try {
    const docCredito = sanitizarParaMH(construirDocumento('01', {
        emisor: emisorPrueba,
        receptor: receptorFE,
        items: itemsFE,
        correlativo: 3,
        condicionOperacion: 2,
        datosPago: {
            codigo: '03',       // Transferencia
            plazo: '01',        // Días
            periodo: 30,        // 30 días
            referencia: 'REF-001',
        },
    }));
    assertField(docCredito, 'resumen.condicionOperacion', 2, 'condicionOperacion = 2 (crédito)');
    assertField(docCredito, 'resumen.pagos[0].plazo', '01', 'plazo = 01 (días)');
    assertField(docCredito, 'resumen.pagos[0].periodo', 30, 'periodo = 30');
    assertField(docCredito, 'resumen.pagos[0].codigo', '03', 'codigo = 03 (transferencia)');
    assertField(docCredito, 'resumen.pagos[0].referencia', 'REF-001', 'referencia presente');
} catch (err) {
    assert(false, `Crédito con datos válidos: ${err.message}`);
}

// ═══════════════════════════════════════
// RESULTADOS
// ═══════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`RESULTADOS: ${passed} pasaron, ${failed} fallaron`);
console.log('════════════════════════════════════════');

if (failed > 0) {
    console.log('\n⚠️  Hay tests fallidos. Revisa los errores arriba.');
    process.exit(1);
} else {
    console.log('\n🎉 Todos los tests pasaron!');
    process.exit(0);
}
