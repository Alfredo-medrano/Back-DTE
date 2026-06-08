/**
 * Script de limpieza: elimina DTEs en estado CONTINGENCIA de la BD.
 * Uso: node scripts/limpiar_contingencia.js
 */
require('dotenv').config();
const { prisma } = require('../src/shared/db/prisma');

async function limpiar() {
    const resultado = await prisma.dte.deleteMany({
        where: { status: 'CONTINGENCIA' },
    });
    console.log(`✅ Borrados ${resultado.count} DTEs en estado CONTINGENCIA.`);
    await prisma.$disconnect();
}

limpiar().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
