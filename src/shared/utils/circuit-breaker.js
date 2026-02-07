/**
 * ========================================
 * CIRCUIT BREAKER
 * ========================================
 * Patrón de resiliencia para APIs externas
 * Evita saturar servicios caídos
 */

/**
 * Estados del circuit breaker
 */
const ESTADOS = {
    CERRADO: 'CERRADO',      // Normal, permite llamadas
    ABIERTO: 'ABIERTO',       // Bloqueado, rechaza llamadas
    SEMI_ABIERTO: 'SEMI_ABIERTO', // Prueba recuperación
};

/**
 * Circuitos activos
 * Map<string, CircuitBreaker>
 */
const circuitos = new Map();

/**
 * Crea un circuit breaker para un servicio
 * @param {string} nombre - Nombre del servicio
 * @param {object} config - Configuración
 */
const crearCircuito = (nombre, config = {}) => {
    const {
        umbralFallos = 5,        // Fallos antes de abrir
        tiempoRecuperacionMs = 30000, // Tiempo antes de semi-abrir
        tiempoVentanaMs = 60000,  // Ventana para contar fallos
    } = config;

    const circuito = {
        nombre,
        estado: ESTADOS.CERRADO,
        fallos: 0,
        ultimoFallo: null,
        config: {
            umbralFallos,
            tiempoRecuperacionMs,
            tiempoVentanaMs,
        },
    };

    circuitos.set(nombre, circuito);
    return circuito;
};

/**
 * Obtiene o crea un circuito
 */
const obtenerCircuito = (nombre) => {
    if (!circuitos.has(nombre)) {
        crearCircuito(nombre);
    }
    return circuitos.get(nombre);
};

/**
 * Verifica si el circuito permite llamadas
 */
const puedeEjecutar = (nombre) => {
    const circuito = obtenerCircuito(nombre);
    const ahora = Date.now();

    switch (circuito.estado) {
        case ESTADOS.CERRADO:
            return true;

        case ESTADOS.ABIERTO:
            // Verificar si es tiempo de probar recuperación
            if (ahora - circuito.ultimoFallo >= circuito.config.tiempoRecuperacionMs) {
                circuito.estado = ESTADOS.SEMI_ABIERTO;
                console.log(`⚡ Circuit Breaker [${nombre}]: SEMI_ABIERTO`);
                return true;
            }
            return false;

        case ESTADOS.SEMI_ABIERTO:
            // Solo permitir una llamada de prueba
            return true;

        default:
            return true;
    }
};

/**
 * Registra una llamada exitosa
 */
const registrarExito = (nombre) => {
    const circuito = obtenerCircuito(nombre);

    if (circuito.estado === ESTADOS.SEMI_ABIERTO) {
        // Recuperado, cerrar circuito
        circuito.estado = ESTADOS.CERRADO;
        circuito.fallos = 0;
        console.log(`✅ Circuit Breaker [${nombre}]: CERRADO (recuperado)`);
    }
};

/**
 * Registra una llamada fallida
 */
const registrarFallo = (nombre) => {
    const circuito = obtenerCircuito(nombre);
    const ahora = Date.now();

    // Limpiar fallos viejos (fuera de la ventana)
    if (circuito.ultimoFallo && ahora - circuito.ultimoFallo > circuito.config.tiempoVentanaMs) {
        circuito.fallos = 0;
    }

    circuito.fallos++;
    circuito.ultimoFallo = ahora;

    if (circuito.estado === ESTADOS.SEMI_ABIERTO) {
        // Falló en prueba, abrir de nuevo
        circuito.estado = ESTADOS.ABIERTO;
        console.log(`❌ Circuit Breaker [${nombre}]: ABIERTO (falló en recuperación)`);
    } else if (circuito.fallos >= circuito.config.umbralFallos) {
        // Umbral alcanzado, abrir circuito
        circuito.estado = ESTADOS.ABIERTO;
        console.log(`🔴 Circuit Breaker [${nombre}]: ABIERTO (umbral: ${circuito.fallos}/${circuito.config.umbralFallos})`);
    }
};

/**
 * Wrapper para ejecutar función con circuit breaker
 * @param {string} nombre - Nombre del servicio
 * @param {Function} fn - Función a ejecutar
 */
const ejecutarConCircuito = async (nombre, fn) => {
    if (!puedeEjecutar(nombre)) {
        throw new Error(`Servicio ${nombre} temporalmente no disponible (Circuit Breaker abierto)`);
    }

    try {
        const resultado = await fn();
        registrarExito(nombre);
        return resultado;
    } catch (error) {
        registrarFallo(nombre);
        throw error;
    }
};

/**
 * Obtiene estado de todos los circuitos (para monitoreo)
 */
const estadoCircuitos = () => {
    const estado = {};
    for (const [nombre, circuito] of circuitos) {
        estado[nombre] = {
            estado: circuito.estado,
            fallos: circuito.fallos,
            ultimoFallo: circuito.ultimoFallo,
        };
    }
    return estado;
};

module.exports = {
    ESTADOS,
    crearCircuito,
    obtenerCircuito,
    puedeEjecutar,
    registrarExito,
    registrarFallo,
    ejecutarConCircuito,
    estadoCircuitos,
};
