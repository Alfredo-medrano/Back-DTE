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

require('dotenv').config();
// Restart
const { validarEntorno } = require('./config/env-validator');
// Force restart - Redis configured at 2026-06-18

// Validar entorno ANTES de inicializar cualquier otra cosa
validarEntorno();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const logger = require('./shared/logger');

// Shared Infrastructure
const { errorHandler, notFoundHandler, requestLogger, rateLimiterCustom } = require('./shared/middleware');
const { prisma } = require('./shared/db');

// Módulos
const { dteRoutes, services: dteServices } = require('./modules/dte');
const { retryQueue } = dteServices;
const iamRoutes = require('./modules/iam/iam.routes');
const authRoutes = require('./modules/auth/auth.routes');

// Crear aplicación Express
const app = express();

// ========================================
// MIDDLEWARES GLOBALES
// ========================================

// Seguridad HTTP (X-Content-Type-Options, HSTS, X-Frame-Options, etc.)
app.use(helmet());

// Compresión gzip para respuestas
app.use(compression());

// CORS — lee orígenes permitidos de env (separados por coma)
const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [];

const isWildcard = corsOrigins.length === 0 || corsOrigins.includes('*');

// SECURITY: en producción es obligatorio definir CORS_ORIGINS explícitos.
// Un wildcard con credentials: true viola la spec CORS y abre la API a
// ataques CSRF desde cualquier origen.
if (isWildcard && config.env === 'production') {
    console.error('\n❌ [SECURITY] CORS_ORIGINS no está definido o contiene "*" en producción.');
    console.error('   Define los orígenes permitidos en .env: CORS_ORIGINS=https://app.tudominio.com');
    process.exit(1);
}

app.use(cors({
    // En desarrollo con wildcard: true permite cualquier origen pero sin credentials.
    // En producción: siempre lista explícita.
    origin: isWildcard ? true : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Emisor-Id', 'X-Admin-Key'],
    // credentials SOLO se activa cuando los orígenes son explícitos.
    // Un wildcard con credentials = true es rechazado por los navegadores y
    // representa una misconfiguración de seguridad crítica.
    credentials: !isWildcard,
    maxAge: 86400, // Preflight cache: 24h
}));

// Parsear JSON
app.use(express.json({ limit: '10mb' }));

// Parsear URL-encoded
app.use(express.urlencoded({ extended: true }));

// Cookie Parser
app.use(cookieParser());

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
            timestamp: new Date().toISOString(),
        });
    }
});

// Deep health check — ISO 22301 Cláusula 8.4 (DRP)
// SECURITY FIX (C5): Requiere X-Admin-Key para acceder. Sin auth, este endpoint
// exponía uptime, memoria del proceso, estado Docker e IPs de circuit breakers —
// información suficiente para fingerprinting y planificación de ataques dirigidos.
app.get('/health/deep', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
        return res.status(401).json({
            exito: false,
            codigo: 'UNAUTHORIZED',
            mensaje: 'Se requiere X-Admin-Key válida para acceder a este endpoint.',
        });
    }

    const checks = {
        database: 'unknown',
        dockerFirmador: 'unknown',
        circuitBreakers: {},
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
    };

    let allOk = true;

    // 1. Base de datos
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'connected';
    } catch {
        checks.database = 'disconnected';
        allOk = false;
    }

    // 2. Docker Firmador
    try {
        const axios = require('axios');
        const resp = await axios.get(`${config.docker.url}/health`, { timeout: 5000 });
        checks.dockerFirmador = resp.status === 200 ? 'connected' : 'degraded';
    } catch {
        checks.dockerFirmador = 'disconnected';
        allOk = false;
    }

    // 3. Circuit Breakers
    try {
        const { estadoCircuitos } = require('./shared/utils/circuit-breaker');
        checks.circuitBreakers = estadoCircuitos();
    } catch {
        checks.circuitBreakers = { error: 'No disponible' };
    }

    const status = allOk ? 'OK' : 'DEGRADED';
    res.status(allOk ? 200 : 503).json({ status, ...checks });
});

// ========================================
// RUTAS API
// ========================================

// Autenticación SSO Hacienda
app.use('/api/auth', authRoutes);

// Módulo DTE (rutas públicas + v2 protegidas)
app.use('/api/dte', dteRoutes);

// Panel de administración IAM (Tenants, Emisores, API Keys)
// SECURITY: rate limiter por IP (no depende de req.tenant) — 30 req/min.
// Previene brute-force sobre ADMIN_SECRET_KEY independientemente del
// orden de ejecución de middlewares.
app.use('/admin', rateLimiterCustom(30, 60_000), iamRoutes);

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
    logger.info('Server started', {
        port: PORT,
        url: `http://localhost:${PORT}`,
        ambiente: config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN',
        dockerFirmador: config.docker.url,
        apiHacienda: config.mh.apiUrl,
    });
    console.log('');
    console.log('========================================');
    console.log('  MIDDLEWARE FACTURACIÓN ELECTRÓNICA');
    console.log('  El Salvador - DTE SaaS v3.0.0');
    console.log('========================================');
    console.log(`🚀 Puerto: ${PORT}  |  Ambiente: ${config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN'}`);
    console.log(`📡 Endpoints: /api/dte/v2/facturar  |  /admin/tenants  |  /health`);
    console.log('========================================');
});
// ========================================
// GRACEFUL SHUTDOWN
// ========================================
const shutdown = async (signal) => {
    logger.warn(`Graceful shutdown initiated`, { signal });
    await prisma.$disconnect();
    server.close(() => {
        logger.info('Server closed cleanly');
        process.exit(0);
    });
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ========================================
// GLOBAL ERROR HANDLERS (ISO 27001 A.12)
// ========================================
// Captura errores no manejados para evitar crashes silenciosos.
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception — initiating shutdown', {
        error: error.message,
        stack: error.stack,
    });
    // En excepciones no capturadas, el proceso está en estado indeterminado.
    // Shutdown graceful para evitar corrupción de datos.
    shutdown('uncaughtException');
});

module.exports = app;
