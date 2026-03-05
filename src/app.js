/**
 * ========================================
 * MIDDLEWARE FACTURACIÓN ELECTRÓNICA
 * El Salvador - API REST
 * ========================================
 * Punto de entrada de la aplicación
 * 
 * Inicia con: npm run dev
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/env');

// Rutas Legacy (compatibilidad)
const facturaRoutes = require('./routes/facturaRoutes');

// Rutas Modulares v2 (Multi-Tenant)
const dteRoutes = require('./modules/dte/dte.routes');

// Middlewares compartidos
const { errorHandler, notFoundHandler, requestLogger } = require('./shared/middleware');

// Crear aplicación Express
const app = express();

// ========================================
// MIDDLEWARES
// ========================================

// Permitir CORS (para frontends externos)
app.use(cors());

// Parsear JSON en el body
app.use(express.json({ limit: '10mb' }));

// Parsear URL-encoded
app.use(express.urlencoded({ extended: true }));

// Log de peticiones (modular)
app.use(requestLogger);

// ========================================
// RUTAS
// ========================================

// Ruta raíz - información básica
app.get('/', (req, res) => {
    res.json({
        nombre: 'Middleware Facturación Electrónica',
        pais: 'El Salvador',
        version: '1.0.0',
        normativa: 'Anexo II - DTE',
        descripcion: 'API REST para generación, firma y transmisión de DTEs',
        endpoints: {
            estado: 'GET /api/status',
            facturar: 'POST /api/facturar',
            consultar: 'GET /api/factura/:codigoGeneracion',
            ejemplo: 'GET /api/ejemplo',
            testFirma: 'POST /api/test-firma',
            testAuth: 'GET /api/test-auth',
        },
        documentacion: 'Ver README.md',
    });
});

// Health check - verifica servicios
app.get('/health', async (req, res) => {
    const config = require('./config/env');

    // Verificar Docker Firmador
    let dockerStatus = { online: false, mensaje: 'No disponible' };
    try {
        const dockerRes = await fetch(`${config.docker.url}/`);
        dockerStatus = {
            online: true,
            mensaje: 'Docker Firmador respondiendo',
            url: config.docker.url
        };
    } catch (error) {
        dockerStatus = {
            online: false,
            mensaje: `Error: ${error.message}`,
            url: config.docker.url
        };
    }

    // Verificar Hacienda (auth)
    let mhStatus = { online: false, mensaje: 'No disponible' };
    try {
        const authRes = await fetch(`${config.mh.apiUrl}/seguridad/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                user: config.mh.nit,
                pwd: config.mh.password
            })
        });
        if (authRes.ok) {
            mhStatus = {
                online: true,
                mensaje: 'Hacienda autenticación OK',
                url: config.mh.apiUrl
            };
        } else {
            mhStatus = {
                online: false,
                mensaje: `HTTP ${authRes.status}`,
                url: config.mh.apiUrl
            };
        }
    } catch (error) {
        mhStatus = {
            online: false,
            mensaje: `Error: ${error.message}`,
            url: config.mh.apiUrl
        };
    }

    const todosOnline = dockerStatus.online && mhStatus.online;

    res.status(todosOnline ? 200 : 503).json({
        status: todosOnline ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        servicios: {
            api: { online: true, mensaje: 'API corriendo', puerto: config.port },
            docker: dockerStatus,
            hacienda: mhStatus
        }
    });
});

// ========================================
// RUTAS API
// ========================================

// Rutas Legacy (compatibilidad con v1)
// NOTA: Estas rutas usan config global, NO son multi-tenant
app.use('/api', facturaRoutes);

// Rutas Modulares v2 (Multi-Tenant SaaS)
// Incluyen: tenantContext, rateLimiter, validateDTE
app.use('/api/dte', dteRoutes);

// ========================================
// MANEJO DE ERRORES (Modular)
// ========================================
app.use(notFoundHandler);
app.use(errorHandler);

// ========================================
// INICIAR SERVIDOR
// ========================================

// Servicios de background
const { iniciarProcesadorPeriodico } = require('./modules/dte/services/retry-queue.service');

const PORT = config.port;

app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  MIDDLEWARE FACTURACIÓN ELECTRÓNICA');
    console.log('  El Salvador - DTE');
    console.log('========================================');
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🐳 Docker Firmador: ${config.docker.url}`);
    console.log(`🏛️  API Hacienda: ${config.mh.apiUrl}`);
    console.log(`🌍 Ambiente: ${config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN'}`);
    console.log('========================================');
    console.log('');
    console.log('Endpoints Legacy (v1 - config global):');
    console.log('  GET  /api/status - Estado componentes');
    console.log('  POST /api/facturar - Crear factura');
    console.log('  GET  /api/ejemplo - Documento ejemplo');
    console.log('');
    console.log('Endpoints SaaS (v2 - Multi-Tenant):');
    console.log('  GET  /api/dte/status - Estado (público)');
    console.log('  POST /api/dte/v2/facturar - Crear factura [Auth]');
    console.log('  GET  /api/dte/v2/facturas - Listar [Auth]');
    console.log('  GET  /api/dte/v2/factura/:codigo - Consultar [Auth]');
    console.log('');

    // Iniciar procesador de reintentos en background (cada 5 min)
    iniciarProcesadorPeriodico(5);
});

module.exports = app;
