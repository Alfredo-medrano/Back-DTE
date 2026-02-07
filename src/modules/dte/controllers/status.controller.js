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
 */
const obtenerEstado = async (req, res, next) => {
    try {
        const estadoDocker = await signer.verificarEstado();
        const estadoAuth = await mhSender.autenticar();

        res.json({
            exito: true,
            sistema: 'Middleware Facturación Electrónica - El Salvador',
            version: '2.0.0',
            arquitectura: 'MVC Modular',
            componentes: {
                servidor: { online: true, mensaje: 'API funcionando' },
                docker: estadoDocker,
                hacienda: {
                    online: estadoAuth.exito,
                    mensaje: estadoAuth.mensaje,
                },
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
