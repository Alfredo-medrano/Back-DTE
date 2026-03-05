/**
 * ========================================
 * PRISMA RESILIENT WRAPPER
 * ========================================
 * Envuelve operaciones de Prisma con retry automático
 * para manejar conexiones cerradas de Neon PostgreSQL.
 * 
 * Neon cierra conexiones inactivas tras ~5 minutos.
 * Este wrapper detecta el error y reintenta automáticamente.
 */

const MAX_RETRIES = 2;
const RETRY_DELAYS = [100, 500]; // ms entre reintentos

/**
 * Errores de conexión que ameritan reintento
 */
const esErrorConexion = (error) => {
    const mensaje = error.message || '';
    const codigo = error.code || '';

    return (
        // Prisma: conexión cerrada por el servidor
        codigo === 'P1017' ||
        // Prisma: pool timeout
        codigo === 'P2024' ||
        // PostgreSQL: connection closed/reset
        mensaje.includes('Closed') ||
        mensaje.includes('Connection reset') ||
        mensaje.includes('Connection terminated') ||
        mensaje.includes('ECONNRESET') ||
        mensaje.includes('ECONNREFUSED') ||
        mensaje.includes('socket hang up')
    );
};

/**
 * Ejecuta una operación de Prisma con retry automático
 * @param {string} operacion - Nombre descriptivo (para logs)
 * @param {Function} fn - Función async que ejecuta la operación de Prisma
 * @returns {Promise<any>} Resultado de la operación
 */
const conReintento = async (operacion, fn) => {
    let ultimoError;

    for (let intento = 0; intento <= MAX_RETRIES; intento++) {
        try {
            return await fn();
        } catch (error) {
            ultimoError = error;

            if (!esErrorConexion(error) || intento === MAX_RETRIES) {
                throw error;
            }

            const delay = RETRY_DELAYS[intento] || 500;
            console.warn(
                `🔄 [Prisma Retry] ${operacion} - Intento ${intento + 1}/${MAX_RETRIES} ` +
                `(reconectando en ${delay}ms): ${error.message}`
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw ultimoError;
};

module.exports = {
    conReintento,
    esErrorConexion,
};
