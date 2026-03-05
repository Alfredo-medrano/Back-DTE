/**
 * ========================================
 * MIDDLEWARE FACTURACIÓN ELECTRÓNICA
 * El Salvador - API REST
 * ========================================
 * Arquitectura: MVC Modular Multi-Tenant SaaS
 * Versión: 3.0.0
 *
 * Inicia con: npm run dev
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/env');

// Shared Infrastructure
const { errorHandler, notFoundHandler, requestLogger, rateLimiter } = require('./shared/middleware');
const { prisma } = require('./shared/db');

// Módulos
const { dteRoutes, services: dteServices } = require('./modules/dte');
const { retryQueue } = dteServices;
const iamRoutes = require('./modules/iam/iam.routes');

// Crear aplicación Express
const app = express();

// ========================================
// MIDDLEWARES GLOBALES
// ========================================

// CORS
app.use(cors());

// Parsear JSON
app.use(express.json({ limit: '10mb' }));

// Parsear URL-encoded
app.use(express.urlencoded({ extended: true }));

// Logger de peticiones
app.use(requestLogger);

// ========================================
// RUTAS
// ========================================

// Ruta raíz - información del sistema
app.get('/', (req, res) => {
    res.json({
        nombre: 'Middleware Facturación Electrónica SaaS',
        pais: 'El Salvador',
        version: '3.0.0',
        arquitectura: 'MVC Modular Multi-Tenant',
        normativa: 'Anexo II - DTE',
        endpoints: {
            publicos: {
                estado: 'GET /api/dte/status',
                ejemplo: 'GET /api/dte/ejemplo',
                health: 'GET /health',
            },
            protegidos: {
                facturar: 'POST /api/dte/v2/facturar',
                listar: 'GET /api/dte/v2/facturas',
                consultar: 'GET /api/dte/v2/factura/:codigo',
                estadisticas: 'GET /api/dte/v2/estadisticas',
            },
            pruebas: {
                testFirma: 'POST /api/dte/v2/test-firma',
                testAuth: 'GET /api/dte/v2/test-auth',
            },
        },
        autenticacion: 'Header: Authorization: Bearer <api_key>',
    });
});

// Health check - verifica conectividad con BD
app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({
            status: 'OK',
            database: 'connected',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(503).json({
            status: 'ERROR',
            database: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

// ========================================
// RUTAS API
// ========================================

// Módulo DTE (rutas públicas + v2 protegidas)
app.use('/api/dte', dteRoutes);

// Panel de administración IAM (Tenants, Emisores, API Keys)
// Protegido por X-Admin-Key header (ver iam.routes.js)
app.use('/admin', iamRoutes);

// ========================================
// MANEJO DE ERRORES
// ========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ========================================
// INICIAR SERVIDOR
// ========================================

const PORT = config.port;

const server = app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  MIDDLEWARE FACTURACIÓN ELECTRÓNICA');
    console.log('  El Salvador - DTE SaaS v3.0.0');
    console.log('========================================');
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🐳 Docker Firmador: ${config.docker.url}`);
    console.log(`🏛️  API Hacienda: ${config.mh.apiUrl}`);
    console.log(`🌍 Ambiente: ${config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN'}`);
    console.log('========================================');
    console.log('');
    console.log('Endpoints públicos:');
    console.log('  GET  /api/dte/status       - Estado componentes');
    console.log('  GET  /api/dte/ejemplo      - Documento ejemplo');
    console.log('  GET  /health               - Health check BD');
    console.log('');
    console.log('Endpoints v2 (requieren API Key):');
    console.log('  POST /api/dte/v2/facturar      - Crear DTE (FE/CCF/NC)');
    console.log('  GET  /api/dte/v2/facturas      - Listar DTEs');
    console.log('  GET  /api/dte/v2/factura/:id   - Consultar DTE');
    console.log('  GET  /api/dte/v2/estadisticas  - Dashboard');
    console.log('');

    // Iniciar procesador de reintentos en background (cada 5 minutos)
    retryQueue.iniciarProcesadorPeriodico(5);
    console.log('⏰ Procesador de reintentos iniciado (cada 5 min)');
    console.log('');
});

// ========================================
// GRACEFUL SHUTDOWN
// ========================================
const shutdown = async (signal) => {
    console.log(`\n🛑 [${signal}] Cerrando servidor...`);
    await prisma.$disconnect();
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
    // Forzar cierre si tarda más de 10 segundos
    setTimeout(() => {
        console.error('⚠️ Cierre forzado por timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
