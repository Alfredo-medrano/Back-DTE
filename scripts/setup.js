#!/usr/bin/env node
/**
 * ========================================
 * SCRIPT: SETUP INICIAL DEL SERVIDOR
 * ========================================
 * Crea el primer Tenant + Emisor + API Key
 * usando variables del .env
 *
 * Uso:
 *   npm run setup
 *
 * Solo ejecutar UNA VEZ en un servidor limpio.
 * Si el tenant ya existe, el script lo notifica y sale sin errores.
 */

require('dotenv').config();
const { prisma } = require('../src/shared/db');
const { tenantService, apiKeyService } = require('../src/modules/iam');

// Colores consola
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', W = '\x1b[0m';
const ok = (m) => console.log(`${G}✓${W} ${m}`);
const err = (m) => console.error(`${R}✗${W} ${m}`);
const inf = (m) => console.log(`${C}→${W} ${m}`);
const warn = (m) => console.log(`${Y}⚠️ ${W} ${m}`);

// ── Validar variables SETUP_ ────────────────────────────────────
const CAMPOS_REQUERIDOS = [
    'SETUP_TENANT_NOMBRE', 'SETUP_TENANT_EMAIL',
    'SETUP_EMISOR_NIT', 'SETUP_EMISOR_NRC', 'SETUP_EMISOR_NOMBRE',
    'SETUP_EMISOR_COD_ACTIVIDAD', 'SETUP_EMISOR_DESC_ACTIVIDAD',
    'SETUP_EMISOR_COMPLEMENTO', 'SETUP_EMISOR_TELEFONO', 'SETUP_EMISOR_CORREO',
    'SETUP_EMISOR_MH_CLAVE_API', 'SETUP_EMISOR_MH_CLAVE_PRIVADA',
];

const validarSetupEnv = () => {
    const faltantes = CAMPOS_REQUERIDOS.filter(k => !process.env[k]);
    if (faltantes.length > 0) {
        err('Faltan variables de entorno para el setup:');
        faltantes.forEach(k => err(`  ${k}`));
        err('Agrégalas al .env siguiendo el .env.example');
        process.exit(1);
    }
};

// ── Script principal ────────────────────────────────────────────
async function setup() {
    console.log('');
    console.log(`${C}╔═══════════════════════════════════╗`);
    console.log(`║   SETUP INICIAL — FAC-ELECTRONICA  ║`);
    console.log(`╚═══════════════════════════════════╝${W}`);
    console.log('');

    validarSetupEnv();

    const email = process.env.SETUP_TENANT_EMAIL;

    try {
        // ── 1. Verificar si el tenant ya existe ──────────────────
        inf(`Buscando tenant con email: ${email}...`);
        const tenants = await tenantService.listar();
        const existente = tenants.find(t => t.email === email);

        if (existente) {
            warn(`Tenant '${existente.nombre}' ya existe (ID: ${existente.id})`);
            warn('Setup ya fue ejecutado. Sal con éxito sin hacer cambios.');
            await prisma.$disconnect();
            process.exit(0);
        }

        // ── 2. Crear Tenant ──────────────────────────────────────
        inf('Creando tenant...');
        const tenant = await tenantService.crear({
            nombre: process.env.SETUP_TENANT_NOMBRE,
            email: process.env.SETUP_TENANT_EMAIL,
        });
        ok(`Tenant creado: ${tenant.nombre} (ID: ${tenant.id})`);

        // ── 3. Crear Emisor ──────────────────────────────────────
        inf('Creando emisor y encriptando credenciales MH...');
        const emisor = await tenantService.crearEmisor(tenant.id, {
            nit: process.env.SETUP_EMISOR_NIT,
            nrc: process.env.SETUP_EMISOR_NRC,
            nombre: process.env.SETUP_EMISOR_NOMBRE,
            codActividad: process.env.SETUP_EMISOR_COD_ACTIVIDAD,
            descActividad: process.env.SETUP_EMISOR_DESC_ACTIVIDAD,
            complemento: process.env.SETUP_EMISOR_COMPLEMENTO,
            telefono: process.env.SETUP_EMISOR_TELEFONO,
            correo: process.env.SETUP_EMISOR_CORREO,
            mhClaveApi: process.env.SETUP_EMISOR_MH_CLAVE_API,
            mhClavePrivada: process.env.SETUP_EMISOR_MH_CLAVE_PRIVADA,
            ambiente: process.env.SETUP_EMISOR_AMBIENTE || '00',
        });
        ok(`Emisor creado: ${emisor.nombre} (NIT: ${emisor.nit})`);

        // ── 4. Crear API Key de pruebas ───────────────────────────
        inf('Generando API Key...');
        const apiKey = await apiKeyService.crear(tenant.id, {
            nombre: 'API Key Principal',
            ambiente: process.env.SETUP_EMISOR_AMBIENTE || '00',
            permisos: ['dte:create', 'dte:read'],
            rateLimit: 100,
        });
        ok('API Key generada');

        // ── Resumen ───────────────────────────────────────────────
        console.log('');
        console.log(`${G}╔═══════════════════════════════════╗`);
        console.log(`║   ✅ SETUP COMPLETADO               ║`);
        console.log(`╚═══════════════════════════════════╝${W}`);
        console.log('');
        console.log('  Tenant ID  :', tenant.id);
        console.log('  Emisor ID  :', emisor.id);
        console.log('  NIT        :', emisor.nit);
        console.log('  Ambiente   :', emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN');
        console.log('');
        console.log(`  ${Y}⚠️  GUARDA ESTA API KEY — No se mostrará de nuevo:${W}`);
        console.log('');
        console.log(`  ${G}${apiKey.keySecreta}${W}`);
        console.log('');
        console.log('  Úsala como: Authorization: Bearer <api_key>');
        console.log('');

    } catch (error) {
        err(`Error durante el setup: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

setup();
