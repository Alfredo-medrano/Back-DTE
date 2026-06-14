require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { procesarCertificado } = require('../src/shared/utils/cert-helper');
const { encrypt } = require('../src/shared/services/encryption.service');
const { tenantService } = require('../src/modules/iam/services');

const prisma = new PrismaClient();
const certPath = path.join(__dirname, '..', 'docs', 'Certificado_070048272.crt');

async function main() {
    console.log('--- MIGRACIÓN LOCAL DE CERTIFICADOS ---');

    if (!fs.existsSync(certPath)) {
        console.error(`✗ No se encuentra el archivo del certificado en: ${certPath}`);
        process.exit(1);
    }

    // 1. Leer archivo crt
    const certBuffer = fs.readFileSync(certPath);

    // 2. Extraer llaves y NIT
    console.log('Procesando certificado...');
    const certData = procesarCertificado(certBuffer);
    const { nit, publicKeyPem, privateKeyPem, certificadoXml } = certData;

    console.log(`✓ Certificado procesado con éxito para el NIT: ${nit}`);

    // 3. Buscar emisor en BD
    // Buscamos un emisor con este NIT
    // El NIT en BD puede no tener ceros a la izquierda, así que buscamos coincidencia exacta o coincidencia numérica
    const emisor = await prisma.emisor.findFirst({
        where: {
            OR: [
                { nit: nit },
                { nit: nit.replace(/^0+/, '') }
            ]
        }
    });

    if (!emisor) {
        console.error(`✗ No se encontró ningún emisor en la BD con el NIT ${nit}`);
        process.exit(1);
    }

    console.log(`Encontrado emisor: "${emisor.nombre}" (ID: ${emisor.id})`);

    // 4. Cifrar llaves
    console.log('Cifrando llaves de seguridad...');
    const encryptedPublicKey = encrypt(publicKeyPem);
    const encryptedPrivateKey = encrypt(privateKeyPem);
    const encryptedCertificado = encrypt(certificadoXml);

    // 5. Guardar en BD
    console.log('Actualizando emisor en la base de datos...');
    const updateData = {
        mhPublicKey: encryptedPublicKey,
        mhPrivateKey: encryptedPrivateKey,
        mhCertificado: encryptedCertificado,
        certUploadedAt: new Date()
    };
    if (certData.clave) {
        updateData.mhClavePrivada = tenantService.encriptar(certData.clave);
    }

    await prisma.emisor.update({
        where: { id: emisor.id },
        data: updateData
    });

    console.log('\n==================================================');
    console.log('🎉 ¡MIGRACIÓN EXITOSA!');
    console.log(`• Emisor: ${emisor.nombre}`);
    console.log(`• NIT: ${emisor.nit}`);
    console.log(`• Llaves públicas y privadas encriptadas y guardadas.`);
    console.log('==================================================');
}

main()
    .catch((error) => {
        console.error('✗ Error fatal durante la migración:', error.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
