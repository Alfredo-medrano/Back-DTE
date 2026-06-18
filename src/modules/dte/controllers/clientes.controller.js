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
        const clientes = [];
        for (const r of receptoresUnicos) {
            const override = manualesMap.get(r.receptorNumDoc);
            if (override && override.data && override.data.deleted === true) {
                continue; // Excluir clientes eliminados
            }
            const base = {
                id: `dte_${Buffer.from(r.receptorNumDoc).toString('base64url')}`,
                _source: 'dte',
                tipoDocumento: r.receptorTipoDoc || '36',
                nit: r.receptorNumDoc,
                nombre: r.receptorNombre,
                correo: r.receptorCorreo || '',
                nrc: '',
                telefono: '',
                actividadEconomica: '',
                departamento: '',
                municipio: '',
                complemento: '',
                ultimaFactura: r.fechaEmision,
            };

            if (override) {
                clientes.push({ ...base, ...override.data, id: override.id, _source: 'manual' });
            } else {
                clientes.push(base);
            }
        }

        // Agregar clientes puramente manuales (sin facturas asociadas y no eliminados)
        const nitsDteSet = new Set(receptoresUnicos.map(r => r.receptorNumDoc));
        const soloManuales = (manualesRaw || [])
            .filter(r => r.data && r.data.deleted !== true && !nitsDteSet.has(r.data?.nit || r.data?.numDocumento))
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
        const campos = ['nombre', 'nrc', 'correo', 'telefono', 'actividadEconomica', 'departamento', 'municipio', 'complemento', 'tipoDocumento', 'nit'];
        campos.forEach(c => {
            if (req.body[c] !== undefined) {
                updates[c] = String(req.body[c]).trim().substring(0, 500);
            }
        });

        let result = null;

        if (clienteId.startsWith('dte_')) {
            const base64Str = clienteId.substring(4);
            const nit = Buffer.from(base64Str, 'base64url').toString('utf8');
            const nitLimpio = nit.trim().replace(/-/g, '');

            // Buscar si ya existe un override por este NIT
            const [existing] = await prisma.$queryRaw`
                SELECT id, data FROM clientes_crm
                WHERE tenant_id = ${tenant.id} AND data->>'nit' = ${nitLimpio}
                LIMIT 1
            `.catch(() => []);

            const existingData = existing ? existing.data : {};
            const mergedData = {
                ...existingData,
                nit: nitLimpio,
                nombre: (updates.nombre !== undefined ? updates.nombre : (existingData.nombre || req.body.nombre || '')).trim().substring(0, 250),
                tipoDocumento: updates.tipoDocumento !== undefined ? updates.tipoDocumento : (existingData.tipoDocumento || req.body.tipoDocumento || '36'),
                nrc: (updates.nrc !== undefined ? updates.nrc : (existingData.nrc || '')).trim().substring(0, 20),
                correo: (updates.correo !== undefined ? updates.correo : (existingData.correo || '')).trim().toLowerCase().substring(0, 200),
                telefono: (updates.telefono !== undefined ? updates.telefono : (existingData.telefono || '')).trim().substring(0, 30),
                actividadEconomica: (updates.actividadEconomica !== undefined ? updates.actividadEconomica : (existingData.actividadEconomica || '')).trim().substring(0, 10),
                departamento: (updates.departamento !== undefined ? updates.departamento : (existingData.departamento || '')).trim().substring(0, 5),
                municipio: (updates.municipio !== undefined ? updates.municipio : (existingData.municipio || '')).trim().substring(0, 5),
                complemento: (updates.complemento !== undefined ? updates.complemento : (existingData.complemento || '')).trim().substring(0, 500),
                updatedAt: Date.now(),
            };

            const targetId = existing ? existing.id : null;

            if (targetId) {
                [result] = await prisma.$queryRaw`
                    UPDATE clientes_crm
                    SET data = ${JSON.stringify(mergedData)}::jsonb
                    WHERE id = ${targetId} AND tenant_id = ${tenant.id}
                    RETURNING id, data
                `;
            } else {
                [result] = await prisma.$queryRaw`
                    INSERT INTO clientes_crm (id, tenant_id, data, created_at)
                    VALUES (gen_random_uuid()::text, ${tenant.id}, ${JSON.stringify(mergedData)}::jsonb, NOW())
                    RETURNING id, data
                `;
            }
        } else {
            [result] = await prisma.$queryRaw`
                UPDATE clientes_crm
                SET data = data || ${JSON.stringify(updates)}::jsonb
                WHERE id = ${clienteId} AND tenant_id = ${tenant.id}
                RETURNING id, data
            `;
        }

        if (!result) throw new NotFoundError('Cliente no encontrado');

        res.json({ exito: true, cliente: { id: result.id, ...result.data, _source: 'manual' } });
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

        let nitToMarkDeleted = null;

        if (clienteId.startsWith('dte_')) {
            const base64Str = clienteId.substring(4);
            nitToMarkDeleted = Buffer.from(base64Str, 'base64url').toString('utf8');
        } else {
            const [existing] = await prisma.$queryRaw`
                SELECT data FROM clientes_crm WHERE id = ${clienteId} AND tenant_id = ${tenant.id}
            `.catch(() => []);
            if (existing && existing.data) {
                nitToMarkDeleted = existing.data.nit || existing.data.numDocumento;
            }
        }

        let hasDte = false;
        if (nitToMarkDeleted) {
            const nitLimpio = nitToMarkDeleted.trim().replace(/-/g, '');
            const deletedData = {
                nit: nitLimpio,
                deleted: true,
                deletedAt: Date.now()
            };

            // Verificar si existen DTEs para este cliente
            const dteRecord = await prisma.dte.findFirst({
                where: {
                    tenantId: tenant.id,
                    OR: [
                        { receptorNumDoc: nitToMarkDeleted.trim() },
                        { receptorNumDoc: nitLimpio }
                    ]
                },
                select: { id: true }
            });
            hasDte = !!dteRecord;

            if (hasDte) {
                try {
                    await prisma.$queryRaw`
                        INSERT INTO clientes_crm (id, tenant_id, data, created_at)
                        VALUES (gen_random_uuid()::text, ${tenant.id}, ${JSON.stringify(deletedData)}::jsonb, NOW())
                        ON CONFLICT (tenant_id, (data->>'nit'))
                        DO UPDATE SET data = EXCLUDED.data
                    `;
                } catch (dbError) {
                    logger.error('Error al marcar cliente como eliminado en DB:', dbError.message);
                }
            }
        }

        // Si no tiene DTEs asociados, podemos borrar el override de clientes_crm
        if (!hasDte) {
            try {
                await prisma.$queryRaw`
                    DELETE FROM clientes_crm
                    WHERE id = ${clienteId} AND tenant_id = ${tenant.id}
                `;
            } catch (dbError) {
                logger.error('Error al borrar cliente de clientes_crm:', dbError.message);
            }
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
