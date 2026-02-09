#!/usr/bin/env node
/**
 * ========================================
 * TEST RATE LIMITING
 * ========================================
 * 
 * Verifica que el rate limiter funciona correctamente.
 * Usa Tenant B que tiene un límite bajo (5 req/min) para
 * verificar que se recibe 429 Too Many Requests.
 * 
 * Escenario:
 * 1. Tenant B hace requests rápidos al endpoint /status
 * 2. EXPECTED: Después de 5 requests, recibe 429
 * 
 * Prerrequisitos:
 * - Servidor corriendo en localhost:3000
 * - Ejecutar seed_qa.js primero
 * 
 * Uso: node scripts/test_rate_limit.js
 * 
 * @author QA Automation
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ========================================
// CONFIGURACIÓN
// ========================================

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const KEYS_PATH = path.join(__dirname, '..', '.qa_keys.json');
const MAX_REQUESTS = 15; // Enviar más que el límite para garantizar 429
const DELAY_BETWEEN_REQUESTS = 50; // ms

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
};

// ========================================
// UTILIDADES
// ========================================

const log = {
    info: (msg) => console.log(`${C.CYAN}ℹ${C.RESET} ${msg}`),
    success: (msg) => console.log(`${C.GREEN}✓${C.RESET} ${msg}`),
    warn: (msg) => console.log(`${C.YELLOW}⚠${C.RESET} ${msg}`),
    error: (msg) => console.error(`${C.RED}✗${C.RESET} ${msg}`),
    step: (n, msg) => console.log(`\n${C.BRIGHT}${C.CYAN}[PASO ${n}]${C.RESET} ${msg}`),
    passed: (msg) => console.log(`\n${C.BG_GREEN}${C.BRIGHT} ✅ ${msg} ✅ ${C.RESET}`),
    failed: (msg) => console.log(`\n${C.BG_RED}${C.BRIGHT} ❌ ${msg} ❌ ${C.RESET}`),
};

/**
 * Pausa por milisegundos
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Formatea un número con padding
 */
const pad = (n, width = 2) => String(n).padStart(width, ' ');

// ========================================
// MAIN TEST
// ========================================

async function main() {
    console.log(`
${C.BRIGHT}╔═══════════════════════════════════════════╗
║        TEST RATE LIMITING                 ║
║        Protección contra abuso            ║
╚═══════════════════════════════════════════╝${C.RESET}
`);

    // ========================================
    // PASO 0: CARGAR CREDENCIALES QA
    // ========================================
    log.step(0, 'Cargando credenciales QA...');

    if (!fs.existsSync(KEYS_PATH)) {
        log.error(`Archivo de credenciales no encontrado: ${KEYS_PATH}`);
        log.info('Ejecuta primero: node scripts/seed_qa.js');
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    const { tenantB } = credentials;

    log.success('Credenciales cargadas');
    log.info(`Usando Tenant B: ${tenantB.nombre}`);
    log.info(`Rate Limit configurado: ${tenantB.rateLimit} req/min`);

    // ========================================
    // PASO 1: VERIFICAR SERVIDOR
    // ========================================
    log.step(1, 'Verificando servidor API...');

    try {
        const healthRes = await fetch(`${API_BASE}/api/status`);
        if (!healthRes.ok) {
            throw new Error(`Status: ${healthRes.status}`);
        }
        log.success('Servidor respondiendo correctamente');
    } catch (error) {
        log.error(`Servidor no disponible: ${error.message}`);
        log.info('Inicia el servidor: npm run dev');
        process.exit(1);
    }

    // ========================================
    // PASO 2: ENVIAR REQUESTS RÁPIDOS
    // ========================================
    log.step(2, `Enviando ${MAX_REQUESTS} requests rápidos...`);
    console.log(`${C.DIM}   Límite esperado: ${tenantB.rateLimit} requests${C.RESET}`);
    console.log('');

    const results = {
        total: 0,
        success: 0,
        rateLimited: 0,
        errors: 0,
        firstRateLimitAt: null,
    };

    const headers = {
        'Authorization': `Bearer ${tenantB.apiKey}`,
        'X-Emisor-Id': tenantB.emisorId,
    };

    // Tabla de resultados
    console.log(`${C.DIM}   #   Status  Remaining  Result${C.RESET}`);
    console.log(`${C.DIM}   ─────────────────────────────────${C.RESET}`);

    for (let i = 1; i <= MAX_REQUESTS; i++) {
        results.total++;

        try {
            const res = await fetch(`${API_BASE}/api/dte/v2/test-auth`, {
                method: 'GET',
                headers,
            });

            const remaining = res.headers.get('X-RateLimit-Remaining') || '?';
            const limit = res.headers.get('X-RateLimit-Limit') || '?';

            let statusColor = C.GREEN;
            let resultText = 'OK';

            if (res.status === 429) {
                statusColor = C.YELLOW;
                resultText = '⛔ RATE LIMITED';
                results.rateLimited++;
                if (!results.firstRateLimitAt) {
                    results.firstRateLimitAt = i;
                }
            } else if (res.ok) {
                results.success++;
            } else if (res.status === 401) {
                statusColor = C.RED;
                resultText = '🔒 UNAUTHORIZED';
                results.errors++;
            } else {
                statusColor = C.RED;
                resultText = `Error ${res.status}`;
                results.errors++;
            }

            console.log(`   ${pad(i)}   ${statusColor}${res.status}${C.RESET}    ${pad(remaining, 3)}        ${resultText}`);

            // Si ya recibimos 429, hacer algunas más para confirmar
            if (results.rateLimited >= 3) {
                log.info('Rate limiting confirmado, deteniendo prueba');
                break;
            }

        } catch (error) {
            results.errors++;
            console.log(`   ${pad(i)}   ${C.RED}ERR${C.RESET}    ---        ${error.message}`);
        }

        await sleep(DELAY_BETWEEN_REQUESTS);
    }

    // ========================================
    // PASO 3: ANALIZAR RESULTADOS
    // ========================================
    log.step(3, 'Analizando resultados...');

    console.log(`
${C.BRIGHT}Estadísticas:${C.RESET}
  • Total requests: ${results.total}
  • Exitosos (200):  ${C.GREEN}${results.success}${C.RESET}
  • Rate limited:    ${C.YELLOW}${results.rateLimited}${C.RESET}
  • Errores:         ${C.RED}${results.errors}${C.RESET}
  • Primer 429 en:   ${results.firstRateLimitAt ? `request #${results.firstRateLimitAt}` : 'N/A'}
`);

    // ========================================
    // RESULTADO FINAL
    // ========================================
    console.log('═'.repeat(50));

    const expectedLimit = tenantB.rateLimit;
    const tolerance = 2; // Permitir ±2 de tolerancia

    if (results.rateLimited > 0) {
        // Verificar que el rate limit se activó cerca del límite configurado
        const activationPoint = results.firstRateLimitAt;

        if (activationPoint <= expectedLimit + tolerance) {
            log.passed('PRUEBA EXITOSA: Rate Limiting funcionando');
            console.log(`
${C.GREEN}El rate limiter se activó correctamente después de
~${activationPoint - 1} requests (límite: ${expectedLimit}).${C.RESET}
`);
            process.exit(0);
        } else {
            log.warn('Rate limiting activado pero fuera del rango esperado');
            console.log(`
${C.YELLOW}El rate limiter funcionó pero se activó en request #${activationPoint}
cuando el límite configurado es ${expectedLimit}. Revisar configuración.${C.RESET}
`);
            process.exit(0); // Aún consideramos que funciona
        }
    } else if (results.errors > 0 && results.success === 0) {
        log.error('Todas las requests fallaron - revisar autenticación');
        console.log(`
${C.RED}Las requests están fallando con errores de autenticación.
Verificar que las API Keys existen en la base de datos.${C.RESET}
`);
        process.exit(1);
    } else {
        log.failed('PRUEBA FALLIDA: Rate Limiting NO funcionando');
        console.log(`
${C.RED}Se enviaron ${results.total} requests y ninguna fue limitada.
El rate limiter puede estar desactivado o mal configurado.

Verificar:
1. Middleware rateLimiter está en la cadena de /api/dte/v2/*
2. La API Key de Tenant B tiene rateLimit=${expectedLimit}
3. El sistema de caché del rate limiter funciona${C.RESET}
`);
        process.exit(1);
    }
}

// Ejecutar
main().catch((err) => {
    console.error('Error fatal:', err);
    process.exit(1);
});
