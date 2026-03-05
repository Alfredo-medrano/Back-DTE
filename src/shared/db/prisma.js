/**
 * ========================================
 * PRISMA CLIENT SINGLETON
 * ========================================
 * Instancia única del cliente Prisma para toda la aplicación
 * Configurado para resiliencia con Neon PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
        log: ['warn', 'error'],
    });
} else {
    // En desarrollo, evitar múltiples instancias por hot-reload
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['warn', 'error'],
        });
    }
    prisma = global.prisma;
}

// Manejar desconexiones de Neon PostgreSQL
prisma.$on && prisma.$on('error', (e) => {
    console.error('🔴 [Prisma] Error de conexión:', e.message);
});

// Limpieza al cerrar la app
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

module.exports = { prisma };
