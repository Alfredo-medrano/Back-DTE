/**
 * ========================================
 * PRISMA CLIENT SINGLETON
 * ========================================
 * Instancia única del cliente Prisma para toda la aplicación
 */

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
} else {
    // En desarrollo, evitar múltiples instancias por hot-reload
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
        });
    }
    prisma = global.prisma;
}

module.exports = { prisma };
