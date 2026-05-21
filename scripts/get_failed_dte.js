const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dte = await prisma.dte.findFirst({
    where: { codigoGeneracion: '3C79E97B-A57F-43E7-9BC7-A6F250ED96C5' }
  });
  console.log(JSON.stringify(dte.jsonOriginal, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
