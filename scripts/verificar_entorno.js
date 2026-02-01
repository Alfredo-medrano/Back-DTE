/**
 * ========================================
 * VERIFICADOR DE ENTORNO
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Verifica que todos los requisitos estén cumplidos antes de ejecutar pruebas.
 * 
 * Checks realizados:
 * - Node.js instalado y versión correcta
 * - Dependencias npm instaladas
 * - Docker instalado y corriendo
 * - Contenedor svfe-api-firmador activo
 * - Variables de entorno configuradas
 * - Conectividad con API del Ministerio de Hacienda
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../src/config/env');

const execAsync = promisify(exec);

// Colores para output
const C = {
    RESET: "\x1b[0m",
    BRIGHT: "\x1b[1m",
    GREEN: "\x1b[32m",
    RED: "\x1b[31m",
    YELLOW: "\x1b[33m",
    CYAN: "\x1b[36m",
};

/**
 * Imprime resultado de verificación
 */
const printCheck = (nombre, exito, detalles = '') => {
    const icono = exito ? '✓' : '✗';
    const color = exito ? C.GREEN : C.RED;
    console.log(`${color}${icono} ${nombre}${C.RESET}`);
    if (detalles) {
        console.log(`  ${C.CYAN}→ ${detalles}${C.RESET}`);
    }
};

const printHeader = (titulo) => {
    console.log('\n' + C.BRIGHT + C.CYAN + '='.repeat(60) + C.RESET);
    console.log(C.BRIGHT + C.CYAN + ` ${titulo.toUpperCase()} ` + C.RESET);
    console.log(C.BRIGHT + C.CYAN + '='.repeat(60) + C.RESET + '\n');
};

/**
 * Verifica versión de Node.js
 */
const verificarNode = async () => {
    try {
        const version = process.version;
        const versionNum = parseInt(version.slice(1).split('.')[0]);

        if (versionNum >= 14) {
            printCheck('Node.js instalado', true, `Versión ${version}`);
            return true;
        } else {
            printCheck('Node.js instalado', false, `Versión ${version} (se requiere v14+)`);
            return false;
        }
    } catch (error) {
        printCheck('Node.js instalado', false, error.message);
        return false;
    }
};

/**
 * Verifica que las dependencias npm estén instaladas
 */
const verificarDependencias = async () => {
    try {
        const nodeModulesPath = path.join(__dirname, '../node_modules');
        const packageJsonPath = path.join(__dirname, '../package.json');

        if (!fs.existsSync(nodeModulesPath)) {
            printCheck('Dependencias npm', false, 'node_modules no encontrado. Ejecutar: npm install');
            return false;
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencias = Object.keys(packageJson.dependencies || {});

        let faltantes = [];
        for (const dep of dependencias) {
            const depPath = path.join(nodeModulesPath, dep);
            if (!fs.existsSync(depPath)) {
                faltantes.push(dep);
            }
        }

        if (faltantes.length > 0) {
            printCheck('Dependencias npm', false, `Faltantes: ${faltantes.join(', ')}`);
            return false;
        }

        printCheck('Dependencias npm', true, `${dependencias.length} paquetes instalados`);
        return true;
    } catch (error) {
        printCheck('Dependencias npm', false, error.message);
        return false;
    }
};

/**
 * Verifica que Docker esté instalado y corriendo
 */
const verificarDocker = async () => {
    try {
        const { stdout } = await execAsync('docker --version');
        const version = stdout.trim();
        printCheck('Docker instalado', true, version);

        // Verificar que el daemon esté corriendo
        try {
            await execAsync('docker ps');
            printCheck('Docker daemon corriendo', true);
            return true;
        } catch (error) {
            printCheck('Docker daemon corriendo', false, 'Docker no está corriendo. Iniciar Docker Desktop');
            return false;
        }
    } catch (error) {
        printCheck('Docker instalado', false, 'Docker no encontrado. Instalar Docker Desktop');
        return false;
    }
};

/**
 * Verifica que el contenedor del firmador esté activo
 */
const verificarContenedorFirmador = async () => {
    try {
        const { stdout } = await execAsync('docker ps --filter "name=svfe-api-firmador" --format "{{.Status}}"');

        if (stdout.trim().includes('Up')) {
            printCheck('Contenedor svfe-api-firmador', true, 'Activo y corriendo');
            return true;
        } else {
            printCheck('Contenedor svfe-api-firmador', false, 'No está corriendo. Ejecutar: docker-compose up -d');
            return false;
        }
    } catch (error) {
        printCheck('Contenedor svfe-api-firmador', false, 'No encontrado. Ejecutar: docker-compose up -d');
        return false;
    }
};

/**
 * Verifica conectividad con el firmador Docker
 */
const verificarConectividadFirmador = async () => {
    try {
        const response = await axios.get(`${config.docker.url}/`, {
            timeout: 5000,
            validateStatus: () => true, // Aceptar cualquier status
        });

        printCheck('Conectividad con Firmador', true, `Responde en ${config.docker.url}`);
        return true;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            printCheck('Conectividad con Firmador', false, `No responde en ${config.docker.url}`);
        } else {
            printCheck('Conectividad con Firmador', false, error.message);
        }
        return false;
    }
};

/**
 * Verifica variables de entorno requeridas
 */
const verificarVariablesEntorno = () => {
    const variables = [
        { nombre: 'NIT_EMISOR', valor: config.emisor.nit },
        { nombre: 'CLAVE_API', valor: config.mh.claveApi },
        { nombre: 'CLAVE_PUBLICA', valor: config.mh.clavePublica },
        { nombre: 'CLAVE_PRIVADA', valor: config.mh.clavePrivada },
        { nombre: 'MH_API_URL', valor: config.mh.apiUrl },
        { nombre: 'MH_AUTH_URL', valor: config.mh.authUrl },
        { nombre: 'AMBIENTE', valor: config.emisor.ambiente },
    ];

    let todasPresentes = true;

    for (const variable of variables) {
        if (variable.valor) {
            const valorMostrar = variable.nombre.includes('CLAVE')
                ? '******'
                : variable.valor;
            printCheck(`Variable ${variable.nombre}`, true, valorMostrar);
        } else {
            printCheck(`Variable ${variable.nombre}`, false, 'No configurada en .env');
            todasPresentes = false;
        }
    }

    return todasPresentes;
};

/**
 * Verifica conectividad con API del Ministerio de Hacienda
 */
const verificarConectividadMH = async () => {
    try {
        // Solo ping a la URL base, no autenticación completa
        const response = await axios.get(config.mh.apiUrl, {
            timeout: 10000,
            validateStatus: () => true, // Aceptar cualquier status
        });

        printCheck('Conectividad con API MH', true, `API responde (${config.mh.apiUrl})`);
        return true;
    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            printCheck('Conectividad con API MH', false, 'No se puede conectar. Verificar conexión a internet');
        } else {
            printCheck('Conectividad con API MH', true, 'API alcanzable');
            return true;
        }
        return false;
    }
};

/**
 * Verifica que exista el directorio de logs
 */
const verificarDirectorioLogs = () => {
    const logsPath = path.join(__dirname, '../logs');

    if (!fs.existsSync(logsPath)) {
        try {
            fs.mkdirSync(logsPath);
            printCheck('Directorio logs/', true, 'Creado exitosamente');
        } catch (error) {
            printCheck('Directorio logs/', false, error.message);
            return false;
        }
    } else {
        printCheck('Directorio logs/', true, 'Existe');
    }

    return true;
};

/**
 * Ejecuta todas las verificaciones
 */
const ejecutarVerificaciones = async () => {
    printHeader('VERIFICACIÓN DE ENTORNO - SISTEMA DTE');

    console.log(C.CYAN + 'Verificando requisitos del sistema...\n' + C.RESET);

    const resultados = [];

    // Verificaciones de software
    printHeader('Software y Dependencias');
    resultados.push(await verificarNode());
    resultados.push(await verificarDependencias());
    resultados.push(await verificarDocker());
    resultados.push(await verificarContenedorFirmador());

    // Verificaciones de configuración
    printHeader('Configuración');
    resultados.push(verificarVariablesEntorno());
    resultados.push(verificarDirectorioLogs());

    // Verificaciones de conectividad
    printHeader('Conectividad');
    resultados.push(await verificarConectividadFirmador());
    resultados.push(await verificarConectividadMH());

    // Resultados finales
    printHeader('Resumen de Verificación');

    const exitosos = resultados.filter(r => r).length;
    const totales = resultados.length;
    const porcentaje = Math.round((exitosos / totales) * 100);

    console.log(`Verificaciones exitosas: ${C.GREEN}${exitosos}/${totales}${C.RESET} (${porcentaje}%)\n`);

    if (exitosos === totales) {
        console.log(C.GREEN + C.BRIGHT + '✓ ¡ENTORNO LISTO!' + C.RESET);
        console.log(C.CYAN + '  Puede ejecutar las pruebas con: npm test' + C.RESET + '\n');
        process.exit(0);
    } else {
        console.log(C.RED + C.BRIGHT + '✗ ENTORNO INCOMPLETO' + C.RESET);
        console.log(C.YELLOW + '  Corrija los errores antes de ejecutar pruebas' + C.RESET + '\n');
        process.exit(1);
    }
};

// Ejecutar verificaciones
ejecutarVerificaciones().catch(error => {
    console.error(C.RED + '❌ Error durante verificación:', error.message + C.RESET);
    process.exit(1);
});
