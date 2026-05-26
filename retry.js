const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { reintentarEnvio } = require('./src/modules/dte/services/dte-orchestrator.service.js');

async function main() {
    const dte = await prisma.dte.findUnique({ where: { id: '60eae4ec-6bc0-4263-8d6b-19b275e8da07' }, include: { emisor: true } });
    if (!dte) { console.log('DTE no encontrado'); return; }
    
    // El emisor debe tener las propiedades descifradas en un entorno real pero para ver el error 400 nos basta enviarlo tal cual o desencriptar.
    // Usaremos mh-sender autenticar o ya debe tener mhClaveApi y mhClavePrivada desencriptadas.
    // Asumiré que el emisor de la bd tiene valores claros, si falla auth es otra cosa.
    const resultado = await reintentarEnvio({ dte, emisor: dte.emisor });
    console.log('RESULTADO FINAL:');
    console.log(JSON.stringify(resultado, null, 2));
}

main().finally(() => prisma.$disconnect());
