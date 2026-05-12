/**
 * ========================================
 * SCRIPT DE MIGRACIÓN — API KEYS
 * ========================================
 * PROPÓSITO: Las API Keys existentes están almacenadas en texto plano.
 * Este script las desactiva y genera un reporte de qué tenants
 * necesitan generar una nueva key.
 *
 * EJECUTAR UNA SOLA VEZ en producción antes de deployar el nuevo código.
 *
 * USO:
 *   node scripts/migrate-api-keys.js --dry-run   ← solo reporte, no modifica
 *   node scripts/migrate-api-keys.js              ← modifica la BD
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  MIGRACIÓN: API Keys → SHA-256 Hash              ║');
    console.log(`║  Modo: ${isDryRun ? 'DRY RUN (sin cambios reales)    ' : 'PRODUCCIÓN (¡esto modifica la BD!)'}  ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    // Buscar todas las API Keys activas con la columna 'key' (vieja)
    // NOTA: Este script asume que aún existe la columna 'key' en la BD,
    // es decir, que se ejecuta ANTES de la migración de Prisma.
    let keys;
    try {
        // Acceso raw para leer la columna 'key' antes de que sea renombrada
        keys = await prisma.$queryRaw`
            SELECT ak.id, ak."tenantId", ak.nombre, ak.activo, t.nombre AS "tenantNombre"
            FROM api_keys ak
            JOIN tenants t ON t.id = ak."tenantId"
            WHERE ak.activo = true
        `;
    } catch (err) {
        console.error('❌ Error consultando api_keys:', err.message);
        console.error('   Verifica que la BD esté accesible y el schema no haya cambiado aún.');
        process.exit(1);
    }

    if (keys.length === 0) {
        console.log('✅ No hay API Keys activas. La migración no es necesaria.');
        return;
    }

    console.log(`🔍 Encontradas ${keys.length} API Key(s) activas en texto plano:\n`);

    const agrupadoPorTenant = keys.reduce((acc, k) => {
        if (!acc[k.tenantId]) acc[k.tenantId] = { nombre: k.tenantNombre, keys: [] };
        acc[k.tenantId].keys.push({ id: k.id, nombre: k.nombre });
        return acc;
    }, {});

    for (const [tenantId, data] of Object.entries(agrupadoPorTenant)) {
        console.log(`  Tenant: ${data.nombre} (${tenantId})`);
        data.keys.forEach(k => console.log(`    - Key: "${k.nombre}" (ID: ${k.id})`));
    }

    console.log('');

    if (isDryRun) {
        console.log('⚠️  DRY RUN: ningún cambio aplicado.');
        console.log('   Ejecuta sin --dry-run para desactivar estas keys en producción.');
        return;
    }

    // Desactivar todas las keys activas existentes
    // No podemos hacer hash reverso → se deben regenerar
    const result = await prisma.apiKey.updateMany({
        where: { activo: true },
        data: { activo: false },
    });

    console.log(`✅ ${result.count} API Key(s) desactivadas.`);
    console.log('');
    console.log('PRÓXIMOS PASOS:');
    console.log('  1. Ejecuta la migración de Prisma: npx prisma migrate deploy');
    console.log('  2. Los tenants listados arriba deben generar nuevas API Keys via:');
    console.log('     POST /admin/tenants/:tenantId/api-keys');
    console.log('  3. Distribuye las nuevas keys a tus clientes.');
    console.log('');
}

main()
    .catch(err => {
        console.error('❌ Error en migración:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
