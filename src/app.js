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
const facturaRoutes = require('./routes/facturaRoutes');

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

// Log de peticiones (desarrollo)
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

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

// Rutas de facturación
app.use('/api', facturaRoutes);

// ========================================
// MANEJO DE ERRORES
// ========================================

// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({
        exito: false,
        error: 'Ruta no encontrada',
        ruta: req.path,
    });
});

// Error global
app.use((error, req, res, next) => {
    console.error('❌ Error:', error);
    res.status(500).json({
        exito: false,
        error: 'Error interno del servidor',
        mensaje: error.message,
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

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
    console.log('Endpoints disponibles:');
    console.log('  GET  /           - Info del sistema');
    console.log('  GET  /api/status - Estado de componentes');
    console.log('  POST /api/facturar - Crear factura');
    console.log('  GET  /api/factura/:codigo - Consultar');
    console.log('  GET  /api/ejemplo - Documento ejemplo (Anexo II)');
    console.log('  POST /api/test-firma - Probar firma');
    console.log('  GET  /api/test-auth - Probar auth');
    console.log('');
});

module.exports = app;
