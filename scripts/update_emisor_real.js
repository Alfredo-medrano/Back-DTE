/**
 * Script para actualizar emisor QA con credenciales reales de Hacienda
 * Uso: node scripts/update_emisor_real.js
 */

require('dotenv').config();
const { prisma } = require('../src/shared/db/prisma');
const crypto = require('crypto');

// Configuración de encriptación (misma que tenant.service.js)
const CRYPTO_SECRET_KEY = process.env.CRYPTO_SECRET_KEY;
const CRYPTO_SALT = process.env.CRYPTO_SALT;

if (!CRYPTO_SECRET_KEY || CRYPTO_SECRET_KEY.length < 32) {
    console.error('❌ [SECURITY] CRYPTO_SECRET_KEY no está definida o tiene menos de 32 caracteres.');
    process.exit(1);
}
if (!CRYPTO_SALT || CRYPTO_SALT.length < 32) {
    console.error('❌ [SECURITY] CRYPTO_SALT no está definida o tiene menos de 32 caracteres.');
    process.exit(1);
}

const GCM_KEY = crypto.scryptSync(
    CRYPTO_SECRET_KEY,
    Buffer.from(CRYPTO_SALT, 'hex'),
    32
);

const ALGORITHM_GCM = 'aes-256-gcm';

const encriptar = (texto) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM_GCM, GCM_KEY, iv);
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};


async function main() {
    console.log('🔄 Actualizando emisor con credenciales reales de Hacienda...\n');

    // Credenciales del .env
    const credenciales = {
        nit: process.env.NIT_EMISOR,
        nrc: process.env.NRC_EMISOR,
        nombre: process.env.NOMBRE_EMISOR,
        claveApi: process.env.CLAVE_API,
        clavePrivada: process.env.CLAVE_PRIVADA,
        ambiente: process.env.AMBIENTE || '00',
    };

    console.log('📋 Credenciales a usar:');
    console.log(`   NIT: ${credenciales.nit}`);
    console.log(`   NRC: ${credenciales.nrc}`);
    console.log(`   Nombre: ${credenciales.nombre}`);
    console.log(`   Ambiente: ${credenciales.ambiente}`);
    console.log('');

    // Primero, eliminar cualquier emisor existente con ese NIT (para evitar constraint único)
    const eliminados = await prisma.emisor.deleteMany({
        where: { nit: credenciales.nit }
    });
    if (eliminados.count > 0) {
        console.log(`⚠️ Eliminados ${eliminados.count} emisores con NIT duplicado`);
    }

    // Buscar el emisor de Tenant A (QA)
    const emisorQA = await prisma.emisor.findFirst({
        where: {
            tenant: {
                nombre: { contains: 'Tenant_A' }
            }
        },
        include: {
            tenant: {
                include: { apiKeys: true }
            }
        }
    });

    if (!emisorQA) {
        console.log('❌ No se encontró el emisor de QA. Ejecuta primero: npm run qa:seed');
        process.exit(1);
    }

    console.log(`✅ Emisor encontrado: ${emisorQA.nombre}`);
    console.log(`   Tenant: ${emisorQA.tenant.nombre}`);
    console.log(`   ID: ${emisorQA.id}`);
    console.log('');

    // Encriptar credenciales sensibles
    const claveApiEncriptada = encriptar(credenciales.claveApi);
    const clavePrivadaEncriptada = encriptar(credenciales.clavePrivada);

    // Actualizar
    const emisorActualizado = await prisma.emisor.update({
        where: { id: emisorQA.id },
        data: {
            nit: credenciales.nit,
            nrc: credenciales.nrc,
            nombre: credenciales.nombre,
            mhClaveApi: claveApiEncriptada,
            mhClavePrivada: clavePrivadaEncriptada,
            ambiente: credenciales.ambiente,
        }
    });

    const apiKey = emisorQA.tenant.apiKeys?.[0]?.clave || 'API-KEY-NO-ENCONTRADA';

    console.log('✅ Emisor actualizado exitosamente!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📮 AHORA PUEDES PROBAR EN POSTMAN:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('GET http://localhost:3000/api/dte/v2/test-auth');
    console.log('');
    console.log('🔑 Headers:');
    console.log(`   Authorization: Bearer ${apiKey}`);
    console.log(`   X-Emisor-Id: ${emisorQA.id}`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
});
