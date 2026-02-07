/**
 * ========================================
 * SERVICIO MINISTERIO DE HACIENDA
 * Módulo: DTE
 * ========================================
 * Comunicación con API del MH para envío/consulta de DTEs
 */

const { mhClient, mhAuthClient } = require('../../../shared/integrations');
const config = require('../../../config/env');

// Cache de token
let tokenCache = {
    token: null,
    expiracion: null,
};

/**
 * Autenticación con el Ministerio de Hacienda
 * El token dura 24 horas
 */
const autenticar = async () => {
    try {
        // Verificar token en caché
        if (tokenCache.token && tokenCache.expiracion > Date.now()) {
            console.log('🔑 Usando token en caché');
            return { exito: true, token: tokenCache.token, mensaje: 'Token en caché válido' };
        }

        console.log('🔐 Solicitando nuevo token a Hacienda...');

        const params = new URLSearchParams();
        params.append('user', config.emisor.nit);
        params.append('pwd', config.mh.claveApi);

        const response = await mhAuthClient.post('', params);

        if (response.data?.status === 'OK' && response.data?.body?.token) {
            tokenCache = {
                token: response.data.body.token,
                expiracion: Date.now() + (23 * 60 * 60 * 1000),
            };
            console.log('✅ Token obtenido exitosamente');
            return { exito: true, token: tokenCache.token, mensaje: 'Autenticación exitosa' };
        }

        return { exito: false, token: null, error: response.data, mensaje: 'Respuesta inesperada de Hacienda' };

    } catch (error) {
        console.error('❌ Error de autenticación:', error.message);
        return { exito: false, token: null, error: error.response?.data || error.message, mensaje: 'Error al autenticar' };
    }
};

/**
 * Envía un DTE firmado a Hacienda
 */
const enviarDTE = async (documentoFirmado, ambiente = '00', tipoDte = '01', version = 1, codigoGeneracion = null) => {
    try {
        const auth = await autenticar();
        if (!auth.exito) {
            return { exito: false, error: auth.error, mensaje: 'No se pudo obtener token' };
        }

        console.log('📤 Enviando DTE a Hacienda...');
        console.log(`   Ambiente: ${ambiente}, Tipo: ${tipoDte}, Versión: ${version}`);

        const payload = {
            ambiente,
            idEnvio: Number(Date.now()),
            version: parseInt(version),
            tipoDte,
            codigoGeneracion,
            documento: documentoFirmado,
        };

        const response = await mhClient.post('/fesv/recepciondte', payload, {
            headers: { 'Authorization': auth.token },
        });

        if (response.data?.estado === 'PROCESADO') {
            console.log('✅ DTE procesado por Hacienda');
            return {
                exito: true,
                estado: response.data.estado,
                selloRecibido: response.data.selloRecibido,
                codigoGeneracion: response.data.codigoGeneracion,
                numeroControl: response.data.numeroControl,
                fechaProcesamiento: response.data.fhProcesamiento,
                mensaje: 'DTE procesado exitosamente',
            };
        }

        return {
            exito: false,
            estado: response.data.estado,
            observaciones: response.data.observaciones,
            error: response.data,
            mensaje: 'DTE rechazado por Hacienda',
        };

    } catch (error) {
        console.error('❌ Error al enviar DTE:', error.message);
        return { exito: false, error: error.response?.data || error.message, mensaje: 'Error de comunicación' };
    }
};

/**
 * Consulta el estado de un DTE enviado
 */
const consultarEstado = async (codigoGeneracion, tipoContingente = null) => {
    try {
        const auth = await autenticar();
        if (!auth.exito) return { exito: false, error: 'Sin token' };

        const params = { codigoGeneracion };
        if (tipoContingente) params.tpContingente = tipoContingente;

        const response = await mhClient.post('/fesv/consultadte', params, {
            headers: { 'Authorization': auth.token },
        });

        return { exito: true, data: response.data };
    } catch (error) {
        return { exito: false, error: error.response?.data || error.message };
    }
};

/**
 * Invalida (anula) un DTE
 */
const anularDTE = async (documentoAnulacion) => {
    try {
        const auth = await autenticar();
        if (!auth.exito) return { exito: false, error: 'Sin token' };

        const payload = {
            ambiente: config.emisor.ambiente,
            idEnvio: Date.now(),
            version: 2,
            documento: documentoAnulacion,
        };

        const response = await mhClient.post('/fesv/anulardte', payload, {
            headers: { 'Authorization': auth.token },
        });

        return { exito: response.data.estado === 'PROCESADO', data: response.data };
    } catch (error) {
        return { exito: false, error: error.response?.data || error.message };
    }
};

/**
 * Limpia el token en caché
 */
const limpiarToken = () => {
    tokenCache = { token: null, expiracion: null };
    console.log('🧹 Token limpiado');
};

module.exports = {
    autenticar,
    enviarDTE,
    consultarEstado,
    anularDTE,
    limpiarToken,
};
