/**
 * ========================================
 * MIDDLEWARE FACTURACIÓN ELECTRÓNICA
 * El Salvador - API REST
 * ========================================
 * Arquitectura: MVC Modular SaaS
 * Versión: 3.0.0
 * 
 * Inicia con: node src/app.modular.js
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/env');

// Shared Infrastructure
const { middleware, db } = require('./shared');
const { requestLogger, errorHandler, notFoundHandler, rateLimiterCustom } = middleware;
const { prisma } = db;

// Módulos
const { dteRoutes, services: dteServices } = require('./modules/dte');
const { retryQueue } = dteServices;

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

// Rate limit global (rutas públicas)
app.use(rateLimiterCustom(200, 60000)); // 200 req/min global

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
                estado: 'GET /api/status',
                ejemplo: 'GET /api/ejemplo',
            },
            protegidos: {
                facturar: 'POST /api/v2/facturar',
                listar: 'GET /api/v2/facturas',
                consultar: 'GET /api/v2/factura/:codigo',
                estadisticas: 'GET /api/v2/estadisticas',
            },
            pruebas: {
                testFirma: 'POST /api/v2/test-firma',
                testAuth: 'GET /api/v2/test-auth',
            },
        },
        autenticacion: 'Header Authorization: Bearer sk_xxx',
        modulos: ['dte', 'iam', 'billing (próximo)'],
    });
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ status: 'ERROR', database: 'disconnected', error: error.message });
    }
});

// Módulo DTE (rutas públicas + v2 protegidas)
app.use('/api', dteRoutes);

// ========================================
// MANEJO DE ERRORES
// ========================================

// Ruta no encontrada
app.use(notFoundHandler);

// Error global
app.use(errorHandler);

// ========================================
// INICIAR SERVIDOR
// ========================================

const PORT = config.port;

const server = app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  MIDDLEWARE FACTURACIÓN ELECTRÓNICA');
    console.log('  El Salvador - DTE SaaS');
    console.log('  🏗️  Arquitectura: MVC Modular v3.0');
    console.log('========================================');
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🐳 Docker Firmador: ${config.docker.url}`);
    console.log(`🏛️  API Hacienda: ${config.mh.apiUrl}`);
    console.log(`🌍 Ambiente: ${config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN'}`);
    console.log('========================================');
    console.log('');
    console.log('Endpoints v2 (requieren API Key):');
    console.log('  POST /api/v2/facturar      - Crear factura');
    console.log('  GET  /api/v2/facturas      - Listar DTEs');
    console.log('  GET  /api/v2/factura/:id   - Consultar');
    console.log('  GET  /api/v2/estadisticas  - Dashboard');
    console.log('');
    console.log('Endpoints públicos:');
    console.log('  GET  /api/status           - Estado');
    console.log('  GET  /api/ejemplo          - Ejemplo DTE');
    console.log('  GET  /health               - Health check');
    console.log('');

    // Iniciar procesador de reintentos (cada 5 minutos)
    retryQueue.iniciarProcesadorPeriodico(5);
    console.log('⏰ Procesador de reintentos iniciado (cada 5 min)');
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    await prisma.$disconnect();
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

module.exports = app;
