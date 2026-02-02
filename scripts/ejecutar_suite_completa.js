/**
 * ========================================
 * SCRIPT MAESTRO - SUITE COMPLETA DE PRUEBAS
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Ejecuta todas las pruebas en secuencia:
 * 1. Verificación de entorno
 * 2. Pruebas básicas (Docker + Auth)
 * 3. Pruebas de cada tipo de DTE
 * 4. Pruebas de invalidación
 * 5. Pruebas de consulta
 * 6. Reporte consolidado final
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

// Colores
const C = {
    RESET: "\x1b[0m",
    BRIGHT: "\x1b[1m",
    GREEN: "\x1b[32m",
    RED: "\x1b[31m",
    YELLOW: "\x1b[33m",
    CYAN: "\x1b[36m",
};

const printHeader = (titulo) => {
    console.log('\n' + C.BRIGHT + C.CYAN + '='.repeat(70) + C.RESET);
    console.log(C.BRIGHT + C.CYAN + ` ${titulo.toUpperCase()} ` + C.RESET);
    console.log(C.BRIGHT + C.CYAN + '='.repeat(70) + C.RESET + '\n');
};

const printStep = (numero, titulo) => {
    console.log(`\n${C.BRIGHT}${C.CYAN}╔═══ PASO ${numero}: ${titulo}${C.RESET}`);
};

/**
 * Ejecuta un script Node.js y captura su salida
 */
const ejecutarScript = async (scriptPath, nombrePrueba) => {
    try {
        console.log(`${C.YELLOW}→ Ejecutando ${nombrePrueba}...${C.RESET}\n`);

        const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
            cwd: path.join(__dirname, '..'),
        });

        console.log(stdout);
        if (stderr) {
            console.error(stderr);
        }

        console.log(`${C.GREEN}✓ ${nombrePrueba} completada${C.RESET}\n`);
        return { exito: true, salida: stdout };
    } catch (error) {
        console.error(`${C.RED}✗ ${nombrePrueba} falló${C.RESET}`);
        console.error(error.stdout || error.message);
        return { exito: false, error: error.message, salida: error.stdout };
    }
};

/**
 * Cuenta archivos en el directorio logs
 */
const contarLogs = (patron) => {
    const logsPath = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsPath)) return 0;

    const archivos = fs.readdirSync(logsPath);
    return archivos.filter(f => f.includes(patron)).length;
};

/**
 * Genera reporte consolidado final
 */
const generarReporteConsolidado = (resultados) => {
    printHeader('REPORTE CONSOLIDADO FINAL');

    const exitosas = resultados.filter(r => r.exito).length;
    const fallidas = resultados.filter(r => !r.exito).length;
    const total = resultados.length;

    console.log('📊 RESULTADOS DE LA SUITE COMPLETA:\n');
    console.log(`   Total de fases: ${total}`);
    console.log(`   ${C.GREEN}✓ Exitosas: ${exitosas}${C.RESET}`);
    console.log(`   ${C.RED}✗ Fallidas: ${fallidas}${C.RESET}`);
    console.log(`   Tasa de éxito: ${((exitosas / total) * 100).toFixed(1)}%\n`);

    console.log('📁 ARCHIVOS GENERADOS:\n');
    console.log(`   Logs exitosos: ${contarLogs('exito_')}`);
    console.log(`   Logs de error: ${contarLogs('error_')}`);
    console.log(`   Reportes: ${contarLogs('reporte_')}\n`);

    // Detalle de cada fase
    console.log('📋 DETALLE POR FASE:\n');
    resultados.forEach((r, i) => {
        const icono = r.exito ? '✓' : '✗';
        const color = r.exito ? C.GREEN : C.RED;
        console.log(`   ${color}${icono} Fase ${i + 1}: ${r.nombre}${C.RESET}`);
    });

    console.log('');

    // Guardar reporte JSON
    const reportePath = path.join(__dirname, '../logs', `suite_completa_${Date.now()}.json`);
    const reporteData = {
        fecha: new Date().toISOString(),
        resumen: {
            total,
            exitosas,
            fallidas,
            tasaExito: parseFloat(((exitosas / total) * 100).toFixed(1)),
        },
        fases: resultados,
        archivosGenerados: {
            exitosos: contarLogs('exito_'),
            errores: contarLogs('error_'),
            reportes: contarLogs('reporte_'),
        },
    };

    fs.writeFileSync(reportePath, JSON.stringify(reporteData, null, 2));
    console.log(`${C.CYAN}💾 Reporte guardado: logs/suite_completa_${Date.now()}.json${C.RESET}\n`);
};

/**
 * Ejecuta la suite completa
 */
const ejecutarSuiteCompleta = async () => {
    printHeader('SUITE COMPLETA DE PRUEBAS - MINISTERIO DE HACIENDA');

    console.log(`${C.CYAN}Sistema de Facturación Electrónica - El Salvador${C.RESET}`);
    console.log(`${C.CYAN}Ejecutando suite completa de certificación${C.RESET}\n`);

    const tiempoInicio = Date.now();
    const resultados = [];

    // PASO 1: Verificación de Entorno
    printStep(1, 'VERIFICACIÓN DE ENTORNO');
    const verificacion = await ejecutarScript(
        path.join(__dirname, 'verificar_entorno.js'),
        'Verificación de Entorno'
    );
    resultados.push({
        nombre: 'Verificación de Entorno',
        exito: verificacion.exito,
    });

    if (!verificacion.exito) {
        console.log(`\n${C.RED}${C.BRIGHT}⚠️  ENTORNO NO CONFIGURADO CORRECTAMENTE${C.RESET}`);
        console.log(`${C.YELLOW}Corrija los errores antes de continuar${C.RESET}\n`);
        process.exit(1);
    }

    // PASO 2: Suite Principal de DTEs
    printStep(2, 'SUITE PRINCIPAL DE DTEs');
    const suitePrincipal = await ejecutarScript(
        path.join(__dirname, '../tests/run_tests.js'),
        'Suite Principal (DTE-01, 03, 05, 14)'
    );
    resultados.push({
        nombre: 'Suite Principal DTEs',
        exito: suitePrincipal.exito,
    });

    // PASO 3: Pruebas de Invalidación
    printStep(3, 'PRUEBAS DE INVALIDACIÓN');
    const invalidacion = await ejecutarScript(
        path.join(__dirname, '../tests/test_invalidacion.js'),
        'Pruebas de Invalidación'
    );
    resultados.push({
        nombre: 'Invalidación de DTEs',
        exito: invalidacion.exito,
    });

    // PASO 4: Pruebas de Consulta
    printStep(4, 'PRUEBAS DE CONSULTA DE ESTADO');
    const consulta = await ejecutarScript(
        path.join(__dirname, '../tests/test_consulta.js'),
        'Consulta de Estado'
    );
    resultados.push({
        nombre: 'Consulta de Estado',
        exito: consulta.exito,
    });

    // PASO 5: Reporte Final
    const tiempoTotal = ((Date.now() - tiempoInicio) / 1000).toFixed(2);

    generarReporteConsolidado(resultados);

    console.log(`${C.CYAN}⏱  Tiempo total de ejecución: ${tiempoTotal}s${C.RESET}\n`);

    printHeader('SUITE COMPLETA FINALIZADA');

    const todasExitosas = resultados.every(r => r.exito);

    if (todasExitosas) {
        console.log(`${C.GREEN}${C.BRIGHT}✓ ¡TODAS LAS PRUEBAS EXITOSAS!${C.RESET}`);
        console.log(`${C.GREEN}El sistema está listo para certificación ante el Ministerio de Hacienda${C.RESET}\n`);
        process.exit(0);
    } else {
        console.log(`${C.YELLOW}${C.BRIGHT}⚠  ALGUNAS PRUEBAS FALLARON${C.RESET}`);
        console.log(`${C.YELLOW}Revise los logs en el directorio logs/ para más detalles${C.RESET}\n`);
        process.exit(1);
    }
};

// Ejecutar suite
ejecutarSuiteCompleta().catch(error => {
    console.error(`${C.RED}❌ Error crítico en suite completa:${C.RESET}`, error);
    process.exit(1);
});
