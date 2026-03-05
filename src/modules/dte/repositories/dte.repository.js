/**
 * ========================================
 * REPOSITORIO DTE
 * Módulo: DTE
 * ========================================
 * Persistencia de documentos tributarios
 * Patrón: Outbox para tracking de estados
 */

const { prisma, conReintento } = require('../../../shared/db');

/**
 * Crea un registro DTE en estado CREADO
 * @param {object} datos - Datos del DTE
 * @returns {Promise<object>} DTE creado
 */
const crear = async (datos) => {
    const {
        tenantId,
        emisorId,
        codigoGeneracion,
        numeroControl,
        tipoDte,
        version,
        ambiente,
        fechaEmision,
        horaEmision,
        receptor,
        totales,
        jsonOriginal,
    } = datos;

    const dte = await conReintento('DTE.crear', () => prisma.dte.create({
        data: {
            tenantId,
            emisorId,
            codigoGeneracion,
            numeroControl,
            tipoDte,
            version: version || 1,
            ambiente: ambiente || '00',
            fechaEmision: new Date(fechaEmision),
            horaEmision,
            receptorTipoDoc: receptor.tipoDocumento || '36',
            receptorNumDoc: receptor.numDocumento || receptor.nit,
            receptorNombre: receptor.nombre,
            receptorCorreo: receptor.correo || null,
            totalGravada: totales.totalGravada,
            totalIva: totales.totalIva,
            totalPagar: totales.totalPagar,
            status: 'CREADO',
            jsonOriginal,
        },
    }));

    console.log(`📝 DTE registrado: ${codigoGeneracion} [CREADO]`);
    return dte;
};

/**
 * Actualiza el estado de un DTE
 * @param {string} id - ID del DTE
 * @param {object} datos - Datos a actualizar
 */
const actualizarEstado = async (id, datos) => {
    const { status, selloRecibido, fechaProcesamiento, observaciones, jsonFirmado, errorLog } = datos;

    // Hacienda devuelve fecha en formato "dd/MM/yyyy HH:mm:ss", parsear manualmente
    let fechaProc;
    if (fechaProcesamiento) {
        const match = fechaProcesamiento.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
        if (match) {
            // Convertir dd/MM/yyyy HH:mm:ss → yyyy-MM-dd HH:mm:ss
            fechaProc = new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}`);
        } else {
            fechaProc = new Date(fechaProcesamiento);
        }
        // Si sigue siendo inválida, usar fecha actual
        if (isNaN(fechaProc.getTime())) {
            console.warn(`⚠️ fechaProcesamiento inválida: "${fechaProcesamiento}", usando fecha actual`);
            fechaProc = new Date();
        }
    }

    const dte = await conReintento('DTE.actualizarEstado', () => prisma.dte.update({
        where: { id },
        data: {
            status,
            selloRecibido: selloRecibido || undefined,
            fechaProcesamiento: fechaProc || undefined,
            observaciones: observaciones || undefined,
            jsonFirmado: jsonFirmado || undefined,
            errorLog: errorLog || undefined,
            intentos: { increment: 1 },
        },
    }));

    console.log(`📝 DTE ${id} actualizado: [${status}]`);
    return dte;
};

/**
 * Busca un DTE por código de generación y emisorId
 * SEGURIDAD: Siempre filtrar por emisorId para garantizar aislamiento multi-tenant
 */
const buscarPorCodigo = async (codigoGeneracion, emisorId) => {
    if (!emisorId) {
        throw new Error('emisorId es requerido para garantizar aislamiento multi-tenant');
    }
    return await prisma.dte.findFirst({
        where: {
            codigoGeneracion,
            emisorId, // CRÍTICO: Filtrar por tenant
        },
        include: {
            emisor: true,
            tenant: true,
        },
    });
};

/**
 * Busca un DTE por número de control
 */
const buscarPorNumeroControl = async (numeroControl) => {
    return await prisma.dte.findUnique({
        where: { numeroControl },
    });
};

/**
 * Lista los DTEs de un tenant con filtros
 */
const listar = async (filtros = {}) => {
    const {
        tenantId,
        emisorId,
        tipoDte,
        status,
        fechaDesde,
        fechaHasta,
        page = 1,
        limit = 20,
    } = filtros;

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (emisorId) where.emisorId = emisorId;
    if (tipoDte) where.tipoDte = tipoDte;
    if (status) where.status = status;
    if (fechaDesde || fechaHasta) {
        where.fechaEmision = {};
        if (fechaDesde) where.fechaEmision.gte = new Date(fechaDesde);
        if (fechaHasta) where.fechaEmision.lte = new Date(fechaHasta);
    }

    const [dtes, total] = await Promise.all([
        prisma.dte.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                codigoGeneracion: true,
                numeroControl: true,
                tipoDte: true,
                fechaEmision: true,
                receptorNombre: true,
                totalPagar: true,
                status: true,
                selloRecibido: true,
                createdAt: true,
            },
        }),
        prisma.dte.count({ where }),
    ]);

    return {
        data: dtes,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

/**
 * Obtiene estadísticas de DTEs de un tenant
 */
const estadisticas = async (tenantId, periodo = 'mes') => {
    const hoy = new Date();
    let fechaDesde;

    switch (periodo) {
        case 'dia':
            fechaDesde = new Date(hoy.setHours(0, 0, 0, 0));
            break;
        case 'semana':
            fechaDesde = new Date(hoy.setDate(hoy.getDate() - 7));
            break;
        case 'mes':
        default:
            fechaDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }

    const stats = await prisma.dte.groupBy({
        by: ['status', 'tipoDte'],
        where: {
            tenantId,
            createdAt: { gte: fechaDesde },
        },
        _count: true,
        _sum: {
            totalPagar: true,
        },
    });

    return stats;
};

/**
 * Obtiene DTEs pendientes de reintento (para cola de errores)
 */
const pendientesReintento = async (maxIntentos = 3) => {
    return await prisma.dte.findMany({
        where: {
            status: 'ERROR',
            intentos: { lt: maxIntentos },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
    });
};

module.exports = {
    crear,
    actualizarEstado,
    buscarPorCodigo,
    buscarPorNumeroControl,
    listar,
    estadisticas,
    pendientesReintento,
};
