// Test conexión a Neon PostgreSQL
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_iFMhqmAsc54K@ep-royal-sea-ahq8q54s-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
        }
    }
});

async function main() {
    try {
        console.log('🔌 Conectando a Neon PostgreSQL...');
        await prisma.$connect();
        console.log('✅ Conexión exitosa!');

        // Test query
        const result = await prisma.$queryRaw`SELECT current_database() as db, now() as time`;
        console.log('📊 Test query:', result);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
