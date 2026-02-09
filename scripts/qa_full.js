#!/usr/bin/env node
/**
 * ========================================
 * QA FULL - ORQUESTADOR DE SUITE COMPLETA
 * ========================================
 * 
 * Ejecuta todas las fases de QA Staging en secuencia:
 * 
 * 1. Sanity Checks (entorno + Neon)
 * 2. Seed QA (crear datos de prueba)
 * 3. Test Aislamiento (seguridad multi-tenant)
 * 4. Test Rate Limiting (protección contra abuso)
 * 
 * Uso: node scripts/qa_full.js
 * 
 * Flags:
 *   --skip-seed    Omitir seed_qa.js (usar datos existentes)
 *   --only-saas    Solo ejecutar pruebas SaaS (seed + aislamiento + rate)
 * 
 * @author QA Automation
 * @version 1.0.0
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

// ========================================
// CONFIGURACIÓN
// ========================================

const SCRIPTS_DIR = __dirname;
const ROOT_DIR = path.join(SCRIPTS_DIR, '..');

// Colores para consola
const C = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m',
    BG_RED: '\x1b[41m',
    BG_GREEN: '\x1b[42m',
    BG_YELLOW: '\x1b[43m',
    BLUE: '\x1b[34m',
};

// Parsear argumentos
const args = process.argv.slice(2);
const FLAGS = {
    skipSeed: args.includes('--skip-seed'),
    onlySaas: args.includes('--only-saas'),
    verbose: args.includes('--verbose') || args.includes('-v'),
};

// ========================================
// FASES DE QA
// ========================================

const FASES = [
    // Fase 1: Sanity Checks
    {
        id: '1a',
        nombre: 'Verificación de Entorno',
        comando: 'npm run test:env',
        categoria: 'sanity',
        obligatorio: true,
    },
    {
        id: '1b',
        nombre: 'Conexión Neon (PostgreSQL)',
        comando: 'node scripts/test_neon.js',
        categoria: 'sanity',
        obligatorio: true,
    },
    // Fase 2: Seed QA
    {
        id: '2',
        nombre: 'Seed Datos QA',
        comando: 'node scripts/seed_qa.js',
        categoria: 'seed',
        obligatorio: false, // Puede omitirse con --skip-seed
    },
    // Fase 3: Seguridad SaaS
    {
        id: '3a',
        nombre: 'Test Aislamiento Multi-Tenant',
        comando: 'node scripts/test_aislamiento.js',
        categoria: 'saas',
        obligatorio: true,
        critical: true, // Fallo = vulnerabilidad de seguridad
    },
    {
        id: '3b',
        nombre: 'Test Rate Limiting',
        comando: 'node scripts/test_rate_limit.js',
        categoria: 'saas',
        obligatorio: true,
    },
];

// ========================================
// UTILIDADES
// ========================================

const log = {
    header: (msg) => console.log(`\n${C.BRIGHT}${C.CYAN}${'═'.repeat(60)}${C.RESET}\n${C.BRIGHT}${C.CYAN}  ${msg}${C.RESET}\n${C.BRIGHT}${C.CYAN}${'═'.repeat(60)}${C.RESET}`),
    phase: (id, msg) => console.log(`\n${C.BRIGHT}${C.BLUE}[FASE ${id}]${C.RESET} ${C.BRIGHT}${msg}${C.RESET}`),
    success: (msg) => console.log(`${C.GREEN}  ✓ ${msg}${C.RESET}`),
    error: (msg) => console.log(`${C.RED}  ✗ ${msg}${C.RESET}`),
    warn: (msg) => console.log(`${C.YELLOW}  ⚠ ${msg}${C.RESET}`),
    skip: (msg) => console.log(`${C.DIM}  ⊘ ${msg} (omitido)${C.RESET}`),
    info: (msg) => console.log(`${C.DIM}  ${msg}${C.RESET}`),
};

/**
 * Ejecuta un comando y retorna el resultado
 */
async function ejecutarComando(comando, timeout = 60000) {
    return new Promise((resolve) => {
        const startTime = Date.now();

        const child = exec(comando, {
            cwd: ROOT_DIR,
            env: { ...process.env, FORCE_COLOR: '1' },
            timeout,
        }, (error, stdout, stderr) => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            resolve({
                exito: !error,
                codigo: error?.code || 0,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                duracion: duration,
            });
        });

        // Stream output en modo verbose
        if (FLAGS.verbose) {
            child.stdout?.pipe(process.stdout);
            child.stderr?.pipe(process.stderr);
        }
    });
}

/**
 * Formatea duración para display
 */
function formatDuration(seconds) {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

// ========================================
// MAIN
// ========================================

async function main() {
    const startTime = Date.now();

    console.log(`
${C.BRIGHT}${C.CYAN}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              🧪  QA STAGING - SUITE COMPLETA  🧪            ║
║                                                            ║
║              Middleware Facturación Electrónica            ║
║                      El Salvador                           ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${C.RESET}
`);

    // Mostrar configuración
    if (FLAGS.skipSeed) log.info('Flag: --skip-seed activado');
    if (FLAGS.onlySaas) log.info('Flag: --only-saas activado');
    if (FLAGS.verbose) log.info('Flag: --verbose activado');

    // Filtrar fases según flags
    let fasesAEjecutar = [...FASES];

    if (FLAGS.skipSeed) {
        fasesAEjecutar = fasesAEjecutar.filter(f => f.categoria !== 'seed');
    }

    if (FLAGS.onlySaas) {
        fasesAEjecutar = fasesAEjecutar.filter(f =>
            f.categoria === 'seed' || f.categoria === 'saas'
        );
    }

    // Resultados
    const resultados = [];
    let hayFallosCriticos = false;

    // Ejecutar fases
    for (const fase of fasesAEjecutar) {
        log.phase(fase.id, fase.nombre);
        log.info(`Comando: ${fase.comando}`);

        const resultado = await ejecutarComando(fase.comando);

        resultados.push({
            ...fase,
            ...resultado,
        });

        if (resultado.exito) {
            log.success(`Completado en ${formatDuration(parseFloat(resultado.duracion))}`);
        } else {
            if (fase.critical) {
                log.error(`FALLO CRÍTICO - ${resultado.stderr || 'Ver output'}`);
                hayFallosCriticos = true;
            } else if (fase.obligatorio) {
                log.error(`Fallido (código: ${resultado.codigo})`);
            } else {
                log.warn(`Fallido pero no obligatorio`);
            }

            // Mostrar output de error si no es verbose
            if (!FLAGS.verbose && resultado.stderr) {
                console.log(`${C.DIM}${resultado.stderr.substring(0, 500)}${C.RESET}`);
            }

            // Si falla una prueba crítica, podemos decidir parar o continuar
            if (fase.critical && !FLAGS.verbose) {
                log.warn('Fallo crítico de seguridad detectado');
            }
        }
    }

    // ========================================
    // REPORTE FINAL
    // ========================================
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    log.header('REPORTE FINAL');

    console.log(`
${C.BRIGHT}Resultados por fase:${C.RESET}
`);

    const maxNombre = Math.max(...resultados.map(r => r.nombre.length));

    for (const r of resultados) {
        const status = r.exito
            ? `${C.GREEN}✓ PASS${C.RESET}`
            : (r.critical ? `${C.RED}✗ FAIL (CRÍTICO)${C.RESET}` : `${C.RED}✗ FAIL${C.RESET}`);
        const nombre = r.nombre.padEnd(maxNombre);
        const tiempo = formatDuration(parseFloat(r.duracion)).padStart(8);

        console.log(`  [${r.id}] ${nombre}  ${status}  ${C.DIM}${tiempo}${C.RESET}`);
    }

    // Estadísticas
    const passed = resultados.filter(r => r.exito).length;
    const failed = resultados.filter(r => !r.exito).length;
    const total = resultados.length;

    console.log(`
${C.BRIGHT}Estadísticas:${C.RESET}
  • Total ejecutadas: ${total}
  • Exitosas:         ${C.GREEN}${passed}${C.RESET}
  • Fallidas:         ${failed > 0 ? C.RED : C.GREEN}${failed}${C.RESET}
  • Tiempo total:     ${formatDuration(parseFloat(totalTime))}
`);

    // Veredicto final
    console.log('═'.repeat(60));

    if (passed === total) {
        console.log(`
${C.BG_GREEN}${C.BRIGHT}                                                            ${C.RESET}
${C.BG_GREEN}${C.BRIGHT}   ✅  TODAS LAS PRUEBAS PASARON - STAGING APROBADO  ✅     ${C.RESET}
${C.BG_GREEN}${C.BRIGHT}                                                            ${C.RESET}
`);
        process.exit(0);
    } else if (hayFallosCriticos) {
        console.log(`
${C.BG_RED}${C.BRIGHT}                                                            ${C.RESET}
${C.BG_RED}${C.BRIGHT}   🚨  FALLO CRÍTICO DE SEGURIDAD - NO DESPLEGAR  🚨       ${C.RESET}
${C.BG_RED}${C.BRIGHT}                                                            ${C.RESET}
`);
        process.exit(2);
    } else {
        console.log(`
${C.BG_YELLOW}${C.BRIGHT}                                                            ${C.RESET}
${C.BG_YELLOW}${C.BRIGHT}   ⚠️  ALGUNAS PRUEBAS FALLARON - REVISAR ANTES DE DEPLOY    ${C.RESET}
${C.BG_YELLOW}${C.BRIGHT}                                                            ${C.RESET}
`);
        process.exit(1);
    }
}

// Ejecutar
main().catch((err) => {
    console.error(`${C.RED}Error fatal:${C.RESET}`, err);
    process.exit(1);
});
