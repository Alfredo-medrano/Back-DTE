/**
 * ========================================
 * SEED: Crea tenant y emisor de prueba
 * ========================================
 * Ejecutar: node prisma/seed.js
 */

require('dotenv').config();
const { prisma } = require('../src/shared/db');
const { tenantService, apiKeyService } = require('../src/modules/iam');

async function main() {
    console.log('🌱 Iniciando seed de base de datos...\n');

    // Crear tenant de prueba
    const tenant = await prisma.tenant.upsert({
        where: { email: 'admin@test.com' },
        update: {},
        create: {
            nombre: 'Empresa de Pruebas',
            email: 'admin@test.com',
            telefono: '22222222',
            plan: 'PROFESIONAL',
        },
    });
    console.log('✅ Tenant creado:', tenant.nombre);

    // Crear emisor con datos de .env (retrocompatibilidad)
    const emisorExistente = await prisma.emisor.findUnique({
        where: { nit: process.env.NIT_EMISOR || '070048272' },
    });

    let emisor;
    if (!emisorExistente) {
        emisor = await tenantService.crearEmisor(tenant.id, {
            nit: process.env.NIT_EMISOR || '070048272',
            nrc: process.env.NRC_EMISOR || '3799647',
            nombre: process.env.NOMBRE_EMISOR || 'ALFREDO EZEQUIEL MEDRANO MARTINEZ',
            codActividad: '62010',
            descActividad: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
            complemento: 'SAN SALVADOR, EL SALVADOR',
            telefono: '22222222',
            correo: 'test@test.com',
            mhClaveApi: process.env.CLAVE_API || 'claveapi',
            mhClavePrivada: process.env.CLAVE_PRIVADA || 'claveprivada',
            ambiente: process.env.AMBIENTE || '00',
        });
        console.log('✅ Emisor creado:', emisor.nombre);
    } else {
        emisor = emisorExistente;
        console.log('ℹ️  Emisor ya existe:', emisor.nombre);
    }

    // Crear API Key de prueba
    const keyExistente = await prisma.apiKey.findFirst({
        where: { tenantId: tenant.id },
    });

    if (!keyExistente) {
        const apiKey = await apiKeyService.crear(tenant.id, {
            nombre: 'Key de Desarrollo',
            ambiente: '00',
            permisos: ['dte:create', 'dte:read', 'dte:cancel'],
        });
        console.log('✅ API Key creada (🔐 guarda esta clave, no se mostrará de nuevo):');
        console.log(`   ${apiKey.keySecreta}\n`);
    } else {
        console.log('ℹ️  API Key ya existe para este tenant\n');
    }

    console.log('========================================');
    console.log('Resumen de datos de prueba:');
    console.log('========================================');
    console.log(`Tenant ID: ${tenant.id}`);
    console.log(`Email: ${tenant.email}`);
    console.log(`Emisor NIT: ${emisor.nit}`);
    console.log(`Ambiente: ${process.env.AMBIENTE || '00'} (Pruebas)`);
    console.log('========================================\n');
}

main()
    .catch((e) => {
        console.error('❌ Error en seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
