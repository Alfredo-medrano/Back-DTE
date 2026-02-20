/**
 * ========================================
 * CONTROLADOR DE ESTADO
 * Módulo: DTE
 * ========================================
 */

const { signer, mhSender } = require('../services');

/**
 * Obtiene el estado del sistema
 * GET /api/dte/status
 * 
 * Este endpoint NO requiere autenticación y es tolerante a fallos
 * de Docker y Hacienda para permitir diagnóstico.
 */
const obtenerEstado = async (req, res, next) => {
    try {
        // Verificar Docker (tolerante a fallos)
        let estadoDocker = { online: false, mensaje: 'No verificado' };
        try {
            estadoDocker = await signer.verificarEstado();
        } catch (dockerError) {
            estadoDocker = {
                online: false,
                mensaje: `Error: ${dockerError.message}`,
            };
        }

        // Verificar Hacienda (tolerante a fallos)
        let estadoAuth = { exito: false, mensaje: 'No verificado' };
        try {
            // Solo intentar si hay credenciales configuradas globalmente
            if (process.env.MH_NIT && process.env.MH_CLAVE_API) {
                estadoAuth = await mhSender.autenticar();
            } else {
                estadoAuth = {
                    exito: false,
                    mensaje: 'Credenciales globales no configuradas (multi-tenant mode)',
                };
            }
        } catch (authError) {
            estadoAuth = {
                exito: false,
                mensaje: `Error: ${authError.message}`,
            };
        }

        res.json({
            exito: true,
            sistema: 'Middleware Facturación Electrónica - El Salvador',
            version: '2.0.0',
            arquitectura: 'Multi-Tenant SaaS',
            componentes: {
                servidor: { online: true, mensaje: 'API funcionando' },
                docker: estadoDocker,
                hacienda: {
                    online: estadoAuth.exito,
                    mensaje: estadoAuth.mensaje,
                },
            },
            endpoints: {
                publicos: ['/api/status', '/api/dte/status', '/api/dte/ejemplo'],
                protegidos: '/api/dte/v2/*',
                nota: 'Rutas protegidas requieren Header: Authorization: Bearer {api_key}',
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    obtenerEstado,
};
