#!/usr/bin/env node
/**
 * ========================================
 * SEED QA - DATOS DE PRUEBA MULTI-TENANT
 * ========================================
 * 
 * Script determinista para crear datos de prueba para QA Staging.
 * Ejecutar ANTES de las pruebas de aislamiento y rate limiting.
 * 
 * Crea:
 * - Tenant A: Cliente normal con API Key estándar
 * - Tenant B: Cliente atacante con rate limit bajo (5 req/min)
 * 
 * Uso: node scripts/seed_qa.js
 * 
 * @author QA Automation
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ========================================
// CONFIGURACIÓN
// ========================================

const KEYS_OUTPUT_PATH = path.join(__dirname, '..', '.qa_keys.json');
const QA_PREFIX = 'QA_STAGING_';

// Colores para consola
const C = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m',
};

// ========================================
// UTILIDADES
// ========================================

/**
 * Genera una API Key con formato sk_test_xxx
 * @returns {string} API Key generada
 */
const generarApiKey = () => {
    const random = crypto.randomBytes(24).toString('hex');
    return `sk_test_${random}`;
};

/**
 * Logger estructurado
 */
const log = {
    info: (msg) => console.log(`${C.CYAN}ℹ${C.RESET} ${msg}`),
    success: (msg) => console.log(`${C.GREEN}✓${C.RESET} ${msg}`),
    warn: (msg) => console.log(`${C.YELLOW}⚠${C.RESET} ${msg}`),
    error: (msg) => console.error(`${C.RED}✗${C.RESET} ${msg}`),
    header: (msg) => console.log(`\n${C.BRIGHT}${C.CYAN}${msg}${C.RESET}`),
    dim: (msg) => console.log(`${C.DIM}  ${msg}${C.RESET}`),
};

// ========================================
// MAIN
// ========================================

async function main() {
    console.log(`
${C.BRIGHT}╔═══════════════════════════════════════════╗
║       SEED QA - Multi-Tenant Setup        ║
╚═══════════════════════════════════════════╝${C.RESET}
`);

    // Importar Prisma después del dotenv
    require('dotenv').config();
    const { prisma } = require('../src/shared/db/prisma');

    try {
        // ========================================
        // PASO 1: LIMPIAR DATOS QA ANTERIORES
        // ========================================
        log.header('1. Limpiando datos QA anteriores...');

        // Orden de eliminación respetando foreign keys
        const deletedDtes = await prisma.dte.deleteMany({
            where: { emisor: { tenant: { nombre: { startsWith: QA_PREFIX } } } }
        });
        log.dim(`DTEs eliminados: ${deletedDtes.count}`);

        const deletedApiKeys = await prisma.apiKey.deleteMany({
            where: { nombre: { startsWith: QA_PREFIX } }
        });
        log.dim(`API Keys eliminadas: ${deletedApiKeys.count}`);

        const deletedEmisores = await prisma.emisor.deleteMany({
            where: { tenant: { nombre: { startsWith: QA_PREFIX } } }
        });
        log.dim(`Emisores eliminados: ${deletedEmisores.count}`);

        const deletedTenants = await prisma.tenant.deleteMany({
            where: { nombre: { startsWith: QA_PREFIX } }
        });
        log.dim(`Tenants eliminados: ${deletedTenants.count}`);

        log.success('Datos QA anteriores limpiados');

        // ========================================
        // PASO 2: CREAR TENANT A (Víctima)
        // ========================================
        log.header('2. Creando Tenant A (cliente legítimo)...');

        const keyA = generarApiKey();
        const timestamp = Date.now();

        const tenantA = await prisma.tenant.create({
            data: {
                nombre: `${QA_PREFIX}Tenant_A`,
                email: `qa.tenant.a.${timestamp}@test.local`,
                plan: 'PROFESIONAL',
                apiKeys: {
                    create: {
                        key: keyA,
                        nombre: `${QA_PREFIX}Key_A`,
                        permisos: ['dte:create', 'dte:read', 'dte:invalidate'],
                        rateLimit: 100, // Límite estándar
                        activo: true,
                    }
                },
                emisores: {
                    create: {
                        nit: '06141802941016',
                        nrc: '2819155',
                        nombre: 'QA TENANT A SA DE CV',
                        nombreComercial: 'QA TENANT A',
                        codActividad: '46900',
                        descActividad: 'VENTA AL POR MAYOR DE OTROS PRODUCTOS',
                        tipoEstablecimiento: '01',
                        departamento: '06',
                        municipio: '14',
                        complemento: 'COL ESCALON CALLE PADRES AGUILAR',
                        telefono: '22222222',
                        correo: 'qa.a@test.local',
                        ambiente: '00', // Pruebas
                        mhClaveApi: process.env.MH_CLAVE_API || 'TEST_KEY',
                        mhClavePrivada: process.env.MH_PASSWORD_PRIVADO || 'TEST_PASS',
                        activo: true,
                    }
                }
            },
            include: {
                apiKeys: true,
                emisores: true,
            }
        });

        log.success(`Tenant A creado: ${tenantA.id}`);
        log.dim(`API Key A: ${keyA.substring(0, 20)}...`);
        log.dim(`Emisor A ID: ${tenantA.emisores[0].id}`);
        log.dim(`Rate Limit: 100 req/min (estándar)`);

        // ========================================
        // PASO 3: CREAR TENANT B (Atacante)
        // ========================================
        log.header('3. Creando Tenant B (simula atacante)...');

        const keyB = generarApiKey();

        const tenantB = await prisma.tenant.create({
            data: {
                nombre: `${QA_PREFIX}Tenant_B`,
                email: `qa.tenant.b.${timestamp}@test.local`,
                plan: 'BASICO',
                apiKeys: {
                    create: {
                        key: keyB,
                        nombre: `${QA_PREFIX}Key_B`,
                        permisos: ['dte:create', 'dte:read'],
                        rateLimit: 5, // ⚠️ Límite MUY BAJO para probar rate limiting
                        activo: true,
                    }
                },
                emisores: {
                    create: {
                        nit: '06142803851027',
                        nrc: '3921266',
                        nombre: 'QA TENANT B SA DE CV',
                        nombreComercial: 'QA TENANT B',
                        codActividad: '47190',
                        descActividad: 'VENTA AL POR MENOR EN COMERCIOS NO ESPECIALIZADOS',
                        tipoEstablecimiento: '01',
                        departamento: '06',
                        municipio: '14',
                        complemento: 'COL SAN BENITO',
                        telefono: '77777777',
                        correo: 'qa.b@test.local',
                        ambiente: '00',
                        mhClaveApi: 'FAKE_KEY_FOR_ATTACKER',
                        mhClavePrivada: 'FAKE_PASS',
                        activo: true,
                    }
                }
            },
            include: {
                apiKeys: true,
                emisores: true,
            }
        });

        log.success(`Tenant B creado: ${tenantB.id}`);
        log.dim(`API Key B: ${keyB.substring(0, 20)}...`);
        log.dim(`Emisor B ID: ${tenantB.emisores[0].id}`);
        log.dim(`Rate Limit: 5 req/min (bajo para pruebas)`);

        // ========================================
        // PASO 4: GUARDAR KEYS EN ARCHIVO
        // ========================================
        log.header('4. Guardando credenciales QA...');

        const qaCredentials = {
            generatedAt: new Date().toISOString(),
            tenantA: {
                id: tenantA.id,
                nombre: tenantA.nombre,
                apiKey: keyA,
                emisorId: tenantA.emisores[0].id,
                rateLimit: 100,
            },
            tenantB: {
                id: tenantB.id,
                nombre: tenantB.nombre,
                apiKey: keyB,
                emisorId: tenantB.emisores[0].id,
                rateLimit: 5,
            },
        };

        fs.writeFileSync(KEYS_OUTPUT_PATH, JSON.stringify(qaCredentials, null, 2));
        log.success(`Credenciales guardadas en: ${KEYS_OUTPUT_PATH}`);

        // Verificar que .gitignore incluya el archivo
        const gitignorePath = path.join(__dirname, '..', '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignore = fs.readFileSync(gitignorePath, 'utf8');
            if (!gitignore.includes('.qa_keys.json')) {
                fs.appendFileSync(gitignorePath, '\n# QA Credentials (DO NOT COMMIT)\n.qa_keys.json\n');
                log.warn('.qa_keys.json agregado a .gitignore');
            }
        }

        // ========================================
        // RESUMEN FINAL
        // ========================================
        console.log(`
${C.BRIGHT}${C.GREEN}════════════════════════════════════════════${C.RESET}
${C.GREEN}✅ SEED QA COMPLETADO EXITOSAMENTE${C.RESET}
${C.BRIGHT}${C.GREEN}════════════════════════════════════════════${C.RESET}

${C.BRIGHT}Tenants creados:${C.RESET}
  • Tenant A: ${C.CYAN}${tenantA.nombre}${C.RESET} (víctima, rate=100)
  • Tenant B: ${C.CYAN}${tenantB.nombre}${C.RESET} (atacante, rate=5)

${C.BRIGHT}Próximos pasos:${C.RESET}
  1. ${C.DIM}node scripts/test_aislamiento.js${C.RESET}  → Probar aislamiento de datos
  2. ${C.DIM}node scripts/test_rate_limit.js${C.RESET}   → Probar rate limiting
  3. ${C.DIM}node scripts/qa_full.js${C.RESET}           → Ejecutar suite completa
`);

        await prisma.$disconnect();
        process.exit(0);

    } catch (error) {
        log.error(`Error fatal: ${error.message}`);
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

// Ejecutar
main();
