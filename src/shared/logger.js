/**
 * ========================================
 * LOGGER CENTRAL — Winston
 * ========================================
 * Niveles: error > warn > info > debug
 * - En producción: solo error y warn a consola + todos a archivo
 * - En desarrollo: todo a consola con colores
 *
 * Uso:
 *   const logger = require('./shared/logger');
 *   logger.info('Mensaje', { clave: 'valor' });
 *   logger.error('Error', { err: error.message });
 */

const winston = require('winston');
const path = require('path');

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

// Formato para consola en desarrollo
const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp: ts, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${ts} [${level}] ${message}${metaStr}`;
    })
);

// Formato JSON para archivos en producción
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const transports = [];

// Consola — siempre activa
transports.push(
    new winston.transports.Console({
        format: isDev ? devFormat : prodFormat,
        level: isDev ? 'debug' : 'warn',
    })
);

// Archivos — solo en producción/staging
if (!isDev) {
    const logsDir = path.join(process.cwd(), 'logs');

    transports.push(
        // Todos los logs >= info
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            level: 'info',
            format: prodFormat,
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
            tailable: true,
        }),
        // Solo errores
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: prodFormat,
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        })
    );
}

const logger = winston.createLogger({
    level: isDev ? 'debug' : 'info',
    transports,
    // No salir en errores no capturados aquí (lo maneja el process handler)
    exitOnError: false,
});

module.exports = logger;
