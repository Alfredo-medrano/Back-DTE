/**
 * ========================================
 * PM2 ECOSYSTEM CONFIGURATION
 * Middleware Facturación Electrónica - El Salvador
 * ========================================
 * 
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only dte-api
 *   pm2 start ecosystem.config.js --only dte-worker
 * 
 * Monitoreo:
 *   pm2 status
 *   pm2 logs
 *   pm2 monit
 */

module.exports = {
    apps: [
        // ========================================
        // API PRINCIPAL
        // ========================================
        {
            name: 'dte-api',
            script: './src/app.js',
            // SECURITY NOTE: The rate limiter has been updated to use
            // rate-limiter-flexible with a Redis backend. Safe for multi-instance cluster mode.
            instances: 'max',
            exec_mode: 'cluster',

            // Reinicio automático
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',

            // Variables de entorno
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
            },
            env_staging: {
                NODE_ENV: 'staging',
                PORT: 3000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
            },

            // Logs
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // Manejo de señales
            kill_timeout: 5000,
            wait_ready: true,
            listen_timeout: 10000,
        },

        // ========================================
        // WORKER DE REINTENTOS
        // ========================================
        {
            name: 'dte-worker',
            script: './src/modules/dte/workers/retry-worker.js',
            instances: 1, // Solo una instancia para evitar duplicados
            exec_mode: 'fork',

            autorestart: true,
            watch: false,
            max_memory_restart: '512M',

            // Cron: ejecutar cada 5 minutos
            cron_restart: '*/5 * * * *',

            env: {
                NODE_ENV: 'development',
            },
            env_staging: {
                NODE_ENV: 'staging',
            },
            env_production: {
                NODE_ENV: 'production',
            },

            error_file: './logs/worker-error.log',
            out_file: './logs/worker-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },

        // ========================================
        // WORKER DE CONTINGENCIA
        // ========================================
        {
            name: 'dte-contingency-worker',
            script: './src/modules/dte/workers/contingency-worker.js',
            instances: 1, // Solo una instancia para evitar duplicados
            exec_mode: 'fork',

            autorestart: true,
            watch: false,
            max_memory_restart: '512M',

            env: {
                NODE_ENV: 'development',
            },
            env_staging: {
                NODE_ENV: 'staging',
            },
            env_production: {
                NODE_ENV: 'production',
            },

            error_file: './logs/contingency-worker-error.log',
            out_file: './logs/contingency-worker-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },
    ],
};
