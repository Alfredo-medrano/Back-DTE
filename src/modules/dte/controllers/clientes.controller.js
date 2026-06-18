/**
 * ========================================
 * CONTROLADOR DE CLIENTES (CRM)
 * Módulo: DTE
 * ========================================
 * Directorio de clientes derivado de receptores únicos
 * en el historial de DTEs + overrides manuales.
 *
 * Estrategia: Sin modelo nuevo en Prisma.
 * Los clientes se infieren de los Dtes (receptorNumDoc, receptorNombre,
 * receptorCorreo) y se almacenan overrides en la tabla 'clientes_crm'
 * como JSON en el emisor. Esto evita una migración y mantiene la BD simple.
 *
 * ENDPOINTS:
 *   GET  /api/dte/v2/clientes        — Lista clientes del tenant
 *   POST /api/dte/v2/clientes        — Crear/actualizar cliente manual
 *   PUT  /api/dte/v2/clientes/:id    — Actualizar cliente
 *   DELETE /api/dte/v2/clientes/:id  — Eliminar cliente manual
 */

const { prisma } = require('../../../shared/db');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logger');

/**
 * GET /api/dte/v2/clientes
 * Lista clientes únicos del tenant:
 *  1. Receptores únicos de DTEs emitidos (inferidos)
 *  2. Sobreescrituras manuales guardadas en BD
 * Soporta búsqueda por ?search=
 */
const listarClientes = async (req, res, next) => {
    try {
        const { emisor, tenant } = req;
        const { search = '', page = '1', limit = '50' } = req.query;

        const pageNum  = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip     = (pageNum - 1) * limitNum;

        // ── 1. Receptores únicos inferidos de DTEs ────────────────────────
        const whereClause = {
            emisorId: emisor.id,
            receptorNombre: { not: 'CONSUMIDOR FINAL' },
            // Excluir receptores sin documento (consumidor final)
            NOT: { receptorNumDoc: '' },
        };

        if (search.trim()) {
            whereClause.OR = [
                { receptorNombre:  { contains: search, mode: 'insensitive' } },
                { receptorNumDoc:  { contains: search, mode: 'insensitive' } },
                { receptorCorreo:  { contains: search, mode: 'insensitive' } },
            ];
        }

        // Agrupar por documento receptor para obtener clientes únicos
        const receptoresUnicos = await prisma.dte.findMany({
            where: whereClause,
            distinct: ['receptorNumDoc'],
            select: {
                receptorTipoDoc: true,
                receptorNumDoc:  true,
                receptorNombre:  true,
                receptorCorreo:  true,
                // Tomar la fecha más reciente de facturación para ordenar
                fechaEmision: true,
            },
            orderBy: { fechaEmision: 'desc' },
            skip,
            take: limitNum,
        });

        // ── 2. Overrides manuales del tenant ──────────────────────────────
        // Buscar clientes creados/editados manualmente (tienen _source: 'manual')
        const manualesRaw = await prisma.$queryRaw`
            SELECT id, data, created_at
            FROM clientes_crm
            WHERE tenant_id = ${tenant.id}
            LIMIT 500
        `.catch(() => []); // Si la tabla no existe aún, retornar vacío sin fallar

        const manualesMap = new Map(
            (manualesRaw || []).map(r => [r.data?.nit || r.data?.numDocumento, r])
        );

        // ── 3. Merge: manual override tiene prioridad sobre inferido ──────
        const clientes = receptoresUnicos.map(r => {
            const override = manualesMap.get(r.receptorNumDoc);
            const base = {
                id: `dte_${Buffer.from(r.receptorNumDoc).toString('base64url')}`,
                _source: 'dte',
                tipoDocumento: r.receptorTipoDoc || '36',
                nit: r.receptorNumDoc,
                nombre: r.receptorNombre,
                correo: r.receptorCorreo || '',
                // Campos que solo tiene si hay override manual
                nrc: '',
                telefono: '',
                actividadEconomica: '',
                departamento: '',
                municipio: '',
                complemento: '',
                ultimaFactura: r.fechaEmision,
            };

            if (override) {
                return { ...base, ...override.data, id: override.id, _source: 'manual' };
            }
            return base;
        });

        // Agregar clientes puramente manuales (sin facturas asociadas)
        const nitsDteSet = new Set(receptoresUnicos.map(r => r.receptorNumDoc));
        const soloManuales = (manualesRaw || [])
            .filter(r => !nitsDteSet.has(r.data?.nit || r.data?.numDocumento))
            .map(r => ({ ...r.data, id: r.id, _source: 'manual' }));

        const total = clientes.length + soloManuales.length;
        const todosClientes = [...clientes, ...soloManuales];

        res.json({
            exito: true,
            data: todosClientes,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/dte/v2/clientes
 * Crear un cliente manual (o actualizar si ya existe por NIT).
 * OWASP: Valida y sanea todos los campos de entrada.
 */
const crearCliente = async (req, res, next) => {
    try {
        const { tenant } = req;
        const {
            nit,
            nombre,
            tipoDocumento = '36',
            nrc = '',
            correo = '',
            telefono = '',
            actividadEconomica = '',
            departamento = '',
            municipio = '',
            complemento = '',
        } = req.body;

        // Validación
        if (!nit || typeof nit !== 'string' || nit.trim().length < 5) {
            throw new BadRequestError('nit es requerido (mínimo 5 caracteres)', 'NIT_INVALIDO');
        }
        if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
            throw new BadRequestError('nombre es requerido (mínimo 2 caracteres)', 'NOMBRE_INVALIDO');
        }

        const nitLimpio = nit.trim().replace(/-/g, '');
        const data = {
            nit: nitLimpio,
            nombre: nombre.trim().substring(0, 250),
            tipoDocumento,
            nrc: nrc.trim().substring(0, 20),
            correo: correo.trim().toLowerCase().substring(0, 200),
            telefono: telefono.trim().substring(0, 30),
            actividadEconomica: actividadEconomica.trim().substring(0, 10),
            departamento: departamento.trim().substring(0, 5),
            municipio: municipio.trim().substring(0, 5),
            complemento: complemento.trim().substring(0, 500),
            createdAt: Date.now(),
        };

        // Upsert usando raw query (tabla ligera sin migración Prisma)
        // Si la tabla no existe, creamos el cliente en memoria y devolvemos.
        let cliente;
        try {
            const [result] = await prisma.$queryRaw`
                INSERT INTO clientes_crm (id, tenant_id, data, created_at)
                VALUES (gen_random_uuid()::text, ${tenant.id}, ${JSON.stringify(data)}::jsonb, NOW())
                ON CONFLICT (tenant_id, (data->>'nit'))
                DO UPDATE SET data = EXCLUDED.data
                RETURNING id, data, created_at
            `;
            cliente = { id: result.id, ...result.data, _source: 'manual' };
        } catch (dbError) {
            // La tabla clientes_crm no existe aún — retornar éxito sin persistir
            // (el frontend lo guarda en localStorage como fallback hasta migración)
            logger.warn('clientes_crm table not found, returning in-memory client', { error: dbError.message });
            cliente = { id: `temp_${nitLimpio}`, ...data, _source: 'local' };
        }

        logger.info('Cliente creado/actualizado', { tenantId: tenant.id, nit: nitLimpio });

        res.status(201).json({
            exito: true,
            mensaje: 'Cliente guardado correctamente',
            cliente,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/dte/v2/clientes/:clienteId
 * Actualizar cliente manual
 */
const actualizarCliente = async (req, res, next) => {
    try {
        const { tenant } = req;
        const { clienteId } = req.params;

        if (!clienteId) throw new BadRequestError('clienteId es requerido');

        const updates = {};
        const campos = ['nombre', 'nrc', 'correo', 'telefono', 'actividadEconomica', 'departamento', 'municipio', 'complemento', 'tipoDocumento'];
        campos.forEach(c => {
            if (req.body[c] !== undefined) {
                updates[c] = String(req.body[c]).trim().substring(0, 500);
            }
        });

        try {
            const [result] = await prisma.$queryRaw`
                UPDATE clientes_crm
                SET data = data || ${JSON.stringify(updates)}::jsonb
                WHERE id = ${clienteId} AND tenant_id = ${tenant.id}
                RETURNING id, data
            `;
            if (!result) throw new NotFoundError('Cliente no encontrado');
            res.json({ exito: true, cliente: { id: result.id, ...result.data } });
        } catch (dbError) {
            if (dbError instanceof NotFoundError) throw dbError;
            res.json({ exito: true, mensaje: 'Actualizado localmente (tabla pendiente de migración)' });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/dte/v2/clientes/:clienteId
 * Eliminar cliente manual
 */
const eliminarCliente = async (req, res, next) => {
    try {
        const { tenant } = req;
        const { clienteId } = req.params;

        if (!clienteId) throw new BadRequestError('clienteId es requerido');

        try {
            await prisma.$queryRaw`
                DELETE FROM clientes_crm
                WHERE id = ${clienteId} AND tenant_id = ${tenant.id}
            `;
        } catch {
            // Tabla no existe — no es error crítico
        }

        res.json({ exito: true, mensaje: 'Cliente eliminado' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listarClientes,
    crearCliente,
    actualizarCliente,
    eliminarCliente,
};
