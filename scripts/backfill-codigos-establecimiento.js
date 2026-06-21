/**
 * Script de backfill: normaliza los campos codEstableMH y codPuntoVentaMH
 * en la tabla Emisor estableciendo 'M001' y 'P001' por defecto si están vacíos.
 * Uso: node scripts/backfill-codigos-establecimiento.js
 */
require('dotenv').config();
const { prisma } = require('../src/shared/db/prisma');

async function backfill() {
    console.log('🔍 Buscando emisores para verificar códigos de establecimiento...');

    const todosEmisores = await prisma.emisor.findMany();
    
    // Filtrar en JS para evitar validaciones estrictas del esquema de Prisma sobre campos nullables/no-nullables
    const emisoresAActualizar = todosEmisores.filter(emisor => 
        !emisor.codEstableMH || 
        emisor.codEstableMH.trim() === '' || 
        !emisor.codPuntoVentaMH || 
        emisor.codPuntoVentaMH.trim() === ''
    );

    console.log(`📊 Encontrados ${emisoresAActualizar.length} emisores de un total de ${todosEmisores.length} que requieren normalización.`);

    let actualizados = 0;
    for (const emisor of emisoresAActualizar) {
        const nuevoCodEstable = emisor.codEstableMH && emisor.codEstableMH.trim() !== '' ? emisor.codEstableMH : 'M001';
        const nuevoCodPVMH = emisor.codPuntoVentaMH && emisor.codPuntoVentaMH.trim() !== '' ? emisor.codPuntoVentaMH : 'P001';

        await prisma.emisor.update({
            where: { id: emisor.id },
            data: {
                codEstableMH: nuevoCodEstable,
                codPuntoVentaMH: nuevoCodPVMH
            }
        });

        console.log(`✅ Emisor [NIT: ${emisor.nit}, ID: ${emisor.id}] actualizado: codEstableMH = '${nuevoCodEstable}', codPuntoVentaMH = '${nuevoCodPVMH}'`);
        actualizados++;
    }

    console.log(`🎉 Backfill completado con éxito. Se actualizaron ${actualizados} emisores.`);
    await prisma.$disconnect();
}

backfill().catch((err) => {
    console.error('❌ Error ejecutando backfill:', err.message);
    process.exit(1);
});
