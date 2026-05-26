const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const dte = await prisma.dte.findUnique({ where: { id: '60eae4ec-6bc0-4263-8d6b-19b275e8da07' } });
    console.log(JSON.stringify(dte.jsonOriginal, null, 2));
    console.log('--- ERROR ---');
    console.log(JSON.stringify(dte.errores, null, 2));
}
main().finally(() => prisma.$disconnect());
