/**
 * ========================================
 * VALIDADOR DE VARIABLES DE ENTORNO
 * ========================================
 * Se ejecuta al iniciar el servidor.
 * Si falta alguna variable crítica → process.exit(1)
 * Evita errores crípticos en runtime.
 */

const REQUERIDAS = [
    {
        key: 'DATABASE_URL',
        descripcion: 'URL de conexión a PostgreSQL (Neon)',
        ejemplo: 'postgresql://user:pass@host/db?sslmode=require',
    },
    {
        key: 'DOCKER_FIRMADOR_URL',
        descripcion: 'URL del servicio Docker de firma electrónica',
        ejemplo: 'http://localhost:8113',
    },
    {
        key: 'MH_API_URL',
        descripcion: 'URL base de la API del Ministerio de Hacienda',
        ejemplo: 'https://apitest.dtes.mh.gob.sv',
    },
    {
        key: 'CRYPTO_SECRET_KEY',
        descripcion: 'Clave de encriptación de credenciales MH (mín. 32 chars)',
        minLength: 32,
    },
];

const OPCIONALES_CON_ADVERTENCIA = [
    {
        key: 'ADMIN_SECRET_KEY',
        descripcion: 'Clave para el panel de administración IAM',
        aviso: '⚠️  Panel IAM deshabilitado hasta que se configure.',
    },
];

/**
 * Valida todas las variables de entorno.
 * @throws {never} Llama a process.exit(1) si hay errores críticos.
 */
const validarEntorno = () => {
    const errores = [];

    // Verificar variables requeridas
    for (const variable of REQUERIDAS) {
        const valor = process.env[variable.key];

        if (!valor) {
            errores.push(`  ✗ ${variable.key} — ${variable.descripcion}`);
            if (variable.ejemplo) errores.push(`      Ejemplo: ${variable.ejemplo}`);
        } else if (variable.minLength && valor.length < variable.minLength) {
            errores.push(`  ✗ ${variable.key} — debe tener al menos ${variable.minLength} caracteres (actual: ${valor.length})`);
        }
    }

    // Si hay errores críticos, mostrar y salir
    if (errores.length > 0) {
        console.error('');
        console.error('╔══════════════════════════════════════════════════╗');
        console.error('║  ❌ ERROR: Variables de entorno faltantes         ║');
        console.error('╚══════════════════════════════════════════════════╝');
        console.error('');
        console.error('Las siguientes variables son requeridas y no están definidas:');
        console.error('');
        errores.forEach(e => console.error(e));
        console.error('');
        console.error('📄 Copia .env.example y completa los valores.');
        console.error('');
        process.exit(1);
    }

    // Verificar opcionales y mostrar advertencias
    for (const variable of OPCIONALES_CON_ADVERTENCIA) {
        if (!process.env[variable.key]) {
            console.warn(`  ${variable.aviso}`);
        }
    }
};

module.exports = { validarEntorno };
