/**
 * ========================================
 * SCRIPT DE MIGRACIÓN — CIFRADO CBC → GCM
 * ========================================
 * PROPÓSITO: Re-encriptar credenciales MH (mhClaveApi, mhClavePrivada)
 * de los emisores desde AES-256-CBC a AES-256-GCM con clave derivada via scrypt.
 *
 * EJECUTAR UNA SOLA VEZ en producción DESPUÉS de deployar el nuevo código
 * (que soporta ambos formatos en desencriptar).
 *
 * USO:
 *   node scripts/migrate-encryption.js --dry-run   ← solo reporte
 *   node scripts/migrate-encryption.js              ← modifica la BD
 *
 * PRERREQUISITO:
 *   CRYPTO_SECRET_KEY y CRYPTO_SALT deben estar en el .env.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

// ── Validar variables ─────────────────────────────────────────────────────────
const CRYPTO_SECRET_KEY = process.env.CRYPTO_SECRET_KEY;
const CRYPTO_SALT       = process.env.CRYPTO_SALT;

if (!CRYPTO_SECRET_KEY || CRYPTO_SECRET_KEY.length < 32) {
    console.error('❌ CRYPTO_SECRET_KEY no definida o < 32 chars');
    process.exit(1);
}
if (!CRYPTO_SALT || CRYPTO_SALT.length < 32) {
    console.error('❌ CRYPTO_SALT no definida o < 32 chars');
    process.exit(1);
}

// ── Funciones de cifrado ──────────────────────────────────────────────────────
const GCM_KEY = crypto.scryptSync(CRYPTO_SECRET_KEY, Buffer.from(CRYPTO_SALT, 'hex'), 32);

/**
 * Desencripta un valor usando AES-CBC legacy (padEnd key)
 */
const decryptCbc = (textoEncriptado) => {
    const parts = textoEncriptado.split(':');
    if (parts.length !== 2) return textoEncriptado; // ya en texto plano

    const iv        = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const cbcKey    = Buffer.from(CRYPTO_SECRET_KEY.substring(0, 32).padEnd(32, '0'));
    const decipher  = crypto.createDecipheriv('aes-256-cbc', cbcKey, iv);
    let decrypted   = decipher.update(encrypted, 'hex', 'utf8');
    decrypted      += decipher.final('utf8');
    return decrypted;
};

/**
 * Encripta un valor usando AES-256-GCM nuevo
 */
const encryptGcm = (texto) => {
    const iv      = crypto.randomBytes(12);
    const cipher  = crypto.createCipheriv('aes-256-gcm', GCM_KEY, iv);
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted    += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const isGcmFormat = (val) => val && val.split(':').length === 3;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  MIGRACIÓN: Cifrado CBC → AES-256-GCM            ║');
    console.log(`║  Modo: ${isDryRun ? 'DRY RUN (sin cambios reales)    ' : 'PRODUCCIÓN (¡esto modifica la BD!)'}  ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    const emisores = await prisma.emisor.findMany({
        select: { id: true, nombre: true, mhClaveApi: true, mhClavePrivada: true },
    });

    if (emisores.length === 0) {
        console.log('✅ No hay emisores. Migración no necesaria.');
        return;
    }

    let migratedCount = 0;
    let alreadyGcm    = 0;
    let errors        = 0;

    for (const emisor of emisores) {
        const apiIsLegacy     = !isGcmFormat(emisor.mhClaveApi);
        const privadaIsLegacy = !isGcmFormat(emisor.mhClavePrivada);

        if (!apiIsLegacy && !privadaIsLegacy) {
            alreadyGcm++;
            continue;
        }

        console.log(`  → Migrando emisor: ${emisor.nombre} (${emisor.id})`);

        if (isDryRun) {
            migratedCount++;
            continue;
        }

        try {
            const newClaveApi     = apiIsLegacy     ? encryptGcm(decryptCbc(emisor.mhClaveApi))     : emisor.mhClaveApi;
            const newClavePrivada = privadaIsLegacy ? encryptGcm(decryptCbc(emisor.mhClavePrivada)) : emisor.mhClavePrivada;

            await prisma.emisor.update({
                where: { id: emisor.id },
                data: {
                    mhClaveApi:     newClaveApi,
                    mhClavePrivada: newClavePrivada,
                },
            });
            migratedCount++;
            console.log(`    ✅ OK`);
        } catch (err) {
            errors++;
            console.error(`    ❌ ERROR: ${err.message}`);
        }
    }

    console.log('');
    console.log('─── RESUMEN ─────────────────────────────────────────');
    console.log(`  Total emisores:     ${emisores.length}`);
    console.log(`  Ya en GCM:          ${alreadyGcm}`);
    console.log(`  ${isDryRun ? 'Requieren migración' : 'Migrados'}:      ${migratedCount}`);
    if (errors > 0) console.log(`  Errores:            ${errors} ⚠️`);
    console.log('─────────────────────────────────────────────────────');

    if (isDryRun) {
        console.log('\n⚠️  DRY RUN finalizado. Ejecuta sin --dry-run para aplicar cambios.');
    } else {
        console.log('\n✅ Migración completada.');
    }
}

main()
    .catch(err => {
        console.error('❌ Error fatal en migración:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
