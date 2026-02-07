/**
 * ========================================
 * MIDDLEWARE FACTURACIÓN ELECTRÓNICA
 * El Salvador - API REST
 * ========================================
 * Arquitectura: MVC Modular
 * Versión: 2.0.0
 * 
 * Inicia con: npm run dev
 */

const express = require('express');
const cors = require('cors');
const config = require('./config/env');

// Shared Infrastructure
const { middleware } = require('./shared');
const { requestLogger, errorHandler, notFoundHandler } = middleware;

// Módulos
const { dteRoutes } = require('./modules/dte');

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
        nombre: 'Middleware Facturación Electrónica',
        pais: 'El Salvador',
        version: '2.0.0',
        arquitectura: 'MVC Modular',
        normativa: 'Anexo II - DTE',
        descripcion: 'API REST para generación, firma y transmisión de DTEs',
        endpoints: {
            estado: 'GET /api/status',
            facturar: 'POST /api/facturar',
            transmitir: 'POST /api/transmitir',
            consultar: 'GET /api/factura/:codigoGeneracion',
            ejemplo: 'GET /api/ejemplo',
            testFirma: 'POST /api/test-firma',
            testAuth: 'GET /api/test-auth',
        },
        modulos: ['dte', 'iam (futuro)', 'billing (futuro)'],
        documentacion: 'Ver README.md',
    });
});

// Módulo DTE
app.use('/api', dteRoutes);

// ========================================
// BACKWARD COMPATIBILITY
// Alias para mantener compatibilidad con versión 1.x
// ========================================
const { dteController } = require('./modules/dte/controllers');
app.get('/api/status', dteController.probarAutenticacion); // Alias

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

app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  MIDDLEWARE FACTURACIÓN ELECTRÓNICA');
    console.log('  El Salvador - DTE');
    console.log('  🏗️  Arquitectura: MVC Modular v2.0');
    console.log('========================================');
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🐳 Docker Firmador: ${config.docker.url}`);
    console.log(`🏛️  API Hacienda: ${config.mh.apiUrl}`);
    console.log(`🌍 Ambiente: ${config.emisor.ambiente === '00' ? 'PRUEBAS' : 'PRODUCCIÓN'}`);
    console.log('========================================');
    console.log('');
    console.log('Endpoints disponibles:');
    console.log('  GET  /           - Info del sistema');
    console.log('  GET  /api/status - Estado de componentes');
    console.log('  POST /api/facturar - Crear factura');
    console.log('  POST /api/transmitir - Transmitir DTE directo');
    console.log('  GET  /api/factura/:codigo - Consultar');
    console.log('  GET  /api/ejemplo - Documento ejemplo');
    console.log('  POST /api/test-firma - Probar firma');
    console.log('  GET  /api/test-auth - Probar auth');
    console.log('');
});

module.exports = app;
