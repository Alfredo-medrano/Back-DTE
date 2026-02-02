/**
 * ========================================
 * PRUEBAS DE CONSULTA DE ESTADO DE DTEs
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Prueba la consulta de estado de documentos enviados previamente.
 */

const { printHeader, printPass, printFail, printInfo, saveLog } = require('./test_utils');
const servicioMH = require('../src/services/servicioMH');
const fs = require('fs');
const path = require('path');

/**
 * Obtiene códigos de generación de logs exitosos previos
 */
const obtenerCodigosDeLogsExitosos = () => {
    const logsPath = path.join(__dirname, '../logs');

    if (!fs.existsSync(logsPath)) {
        return [];
    }

    const archivos = fs.readdirSync(logsPath);
    const archivosExito = archivos.filter(f => f.startsWith('exito_') && f.endsWith('.json'));

    const codigos = [];

    for (const archivo of archivosExito) {
        try {
            const contenido = JSON.parse(fs.readFileSync(path.join(logsPath, archivo), 'utf8'));
            if (contenido.codigoGeneracion) {
                codigos.push({
                    codigo: contenido.codigoGeneracion,
                    archivo: archivo,
                    tipo: contenido.respuestaCompleta?.tipoDte || 'desconocido',
                });
            }
        } catch (error) {
            // Ignorar archivos con error
        }
    }

    return codigos;
};

/**
 * Consulta el estado de un DTE
 */
const consultarEstadoDTE = async (codigoGeneracion) => {
    printInfo('CONSULTA', `Consultando estado de: ${codigoGeneracion}`);

    try {
        const resultado = await servicioMH.consultarEstado(codigoGeneracion);

        if (resultado.exito) {
            printPass('Consulta exitosa');
            console.log('   Estado:', resultado.data.estado || 'N/A');
            console.log('   Observaciones:', resultado.data.observaciones || 'Ninguna');

            return resultado.data;
        } else {
            printFail('Error en consulta', resultado.error);
            return null;
        }
    } catch (error) {
        printFail('Error consultando estado', error);
        return null;
    }
};

/**
 * Ejecuta pruebas de consulta
 */
const ejecutarPruebasConsulta = async () => {
    printHeader('PRUEBAS DE CONSULTA DE ESTADO');

    try {
        // Autenticar
        printInfo('AUTH', 'Autenticando con MH...');
        const auth = await servicioMH.autenticar();
        if (!auth.exito) {
            throw new Error('Fallo de autenticación');
        }
        printPass('Autenticación exitosa');

        // Obtener códigos de logs
        const codigos = obtenerCodigosDeLogsExitosos();

        if (codigos.length === 0) {
            console.log('\n⚠️  No se encontraron DTEs exitosos en logs/');
            console.log('   Ejecute primero: npm test\n');
            return;
        }

        printInfo('LOGS', `Encontrados ${codigos.length} DTE(s) para consultar`);

        // Consultar cada uno
        const resultados = [];

        for (let i = 0; i < Math.min(codigos.length, 5); i++) { // Máximo 5 consultas
            const item = codigos[i];
            console.log(`\n--- Consulta ${i + 1}/${Math.min(codigos.length, 5)} ---`);
            const data = await consultarEstadoDTE(item.codigo);

            resultados.push({
                codigo: item.codigo,
                tipo: item.tipo,
                estado: data?.estado || 'ERROR',
                data: data,
            });

            // Pausa entre consultas
            if (i < Math.min(codigos.length, 5) - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Guardar resultados
        saveLog(`consultas_${Date.now()}.json`, {
            fecha: new Date().toISOString(),
            total: resultados.length,
            resultados: resultados,
        });

        printHeader('RESULTADOS');
        console.log(`✓ Consultas exitosas: ${resultados.filter(r => r.estado !== 'ERROR').length}`);
        console.log(`✗ Consultas fallidas: ${resultados.filter(r => r.estado === 'ERROR').length}\n`);

    } catch (error) {
        printFail('Error en pruebas de consulta', error);
        process.exit(1);
    }
};

// Ejecutar
ejecutarPruebasConsulta();
