/**
 * ========================================
 * PRUEBAS DE FLUJO DE EVENTO DE CONTINGENCIA
 * Sistema de Facturación Electrónica - El Salvador
 * ========================================
 * Simula fallos de conexión, circuito abierto y retransmisión diferida.
 */

const { printHeader, printPass, printFail, printInfo, saveLog } = require('./test_utils');
const { prisma } = require('../src/shared/db/prisma');
const { dteController } = require('../src/modules/dte/controllers');
const circuitBreaker = require('../src/shared/utils/circuit-breaker');
const mhSender = require('../src/modules/dte/services/mh-sender.service');
const contingencyWorker = require('../src/modules/dte/workers/contingency-worker');

async function testContingencia() {
    printHeader('INICIANDO PRUEBAS DE EVENTO DE CONTINGENCIA');

    try {
        // 1. Obtener tenant y emisor de prueba
        const tenant = await prisma.tenant.findFirst();
        const emisor = await prisma.emisor.findFirst({ where: { tenantId: tenant.id } });

        if (!tenant || !emisor) {
            throw new Error('No se encontró un Tenant o Emisor en la BD. Ejecute el setup o seed primero.');
        }

        printPass(`Tenant cargado: ${tenant.nombre} (ID: ${tenant.id})`);
        printPass(`Emisor cargado: ${emisor.nombre} (NIT: ${emisor.nit})`);

        // Datos del DTE a crear
        const dteData = {
            tipoDte: '01',
            receptor: {
                tipoDocumento: '36',
                numDocumento: '070048272',
                nrc: '3799647',
                nombre: 'CLIENTE PRUEBA CONTINGENCIA S.A.',
                codActividad: '62010',
                descActividad: 'PROGRAMACION INFORMATICA',
                direccion: {
                    departamento: '06',
                    municipio: '14',
                    complemento: 'EDIFICIO PRUEBAS, SAN SALVADOR',
                },
                telefono: '22223333',
                correo: 'cliente@contingencia.com',
            },
            items: [
                {
                    descripcion: 'DESARROLLO DE FUNCIONALIDAD DTE',
                    cantidad: 1,
                    precioUnitario: 100.00,
                    codigo: 'SERV-DTE',
                    tipoItem: 1,
                }
            ],
            condicionOperacion: 1,
        };

        // =========================================================================
        // ESCENARIO A: Contingencia Directa (Circuit Breaker Abierto)
        // =========================================================================
        printHeader('ESCENARIO A: CONTINGENCIA DIRECTA POR CIRCUIT BREAKER ABIERTO');

        // Abrir circuit breaker manualmente
        const cb = circuitBreaker.obtenerCircuito('HACIENDA_MH');
        cb.estado = circuitBreaker.ESTADOS.ABIERTO;
        cb.ultimoFallo = Date.now();

        printInfo('CIRCUIT-BREAKER', 'Circuit Breaker forzado a estado: ABIERTO');

        // Simular llamada a crearFactura
        let resStatusA = null;
        let resDataA = null;

        const reqA = {
            body: dteData,
            validatedBody: dteData,
            tenant,
            emisor,
        };

        const resA = {
            status: (code) => {
                resStatusA = code;
                return resA;
            },
            json: (data) => {
                resDataA = data;
                return resA;
            }
        };

        const nextA = (err) => {
            if (err) throw err;
        };

        await dteController.crearFactura(reqA, resA, nextA);

        if (resStatusA === 201 && resDataA && resDataA.datos.estado === 'CONTINGENCIA') {
            printPass('DTE creado exitosamente bajo modo contingencia directa.');
            console.log('   Mensaje:', resDataA.mensaje);
            console.log('   Código Generación:', resDataA.datos.codigoGeneracion);
            console.log('   Fecha Límite Transmisión:', resDataA.datos.fechaLimiteTransmision);
        } else {
            throw new Error(`Fallo escenario A: Status esperado 201, recibido ${resStatusA}. Data: ${JSON.stringify(resDataA)}`);
        }

        // Validar en la base de datos
        const dteA_db = await prisma.dte.findFirst({
            where: { codigoGeneracion: resDataA.datos.codigoGeneracion }
        });

        if (dteA_db && dteA_db.status === 'CONTINGENCIA') {
            printPass('DTE registrado correctamente en la Base de Datos con estado CONTINGENCIA.');
            if (dteA_db.tipoContingencia === '1' && dteA_db.motivoContin.includes('NO DISPONIBILIDAD')) {
                printPass('Valores tipoContingencia y motivoContin inyectados correctamente.');
            } else {
                printFail('Campos de contingencia incorrectos en BD.');
            }
            if (dteA_db.jsonOriginal && dteA_db.jsonOriginal.identificacion.tipoOperacion === 2) {
                printPass('JSON original tiene tipoOperacion = 2 (Diferido).');
            } else {
                printFail('JSON original tipoOperacion es incorrecto (esperado 2).');
            }
            if (dteA_db.jsonFirmado) {
                printPass('El DTE fue firmado localmente con éxito.');
            } else {
                printFail('El DTE no tiene firma local.');
            }
        } else {
            throw new Error('No se encontró el DTE en la BD o su estado no es CONTINGENCIA');
        }

        // =========================================================================
        // ESCENARIO B: Fallback a Contingencia por Fallo de Conectividad (MH caido)
        // =========================================================================
        printHeader('ESCENARIO B: FALLBACK AUTOMÁTICO A CONTINGENCIA POR FALLO DE RED');

        // Cerrar circuit breaker
        cb.estado = circuitBreaker.ESTADOS.CERRADO;
        cb.fallos = 0;
        printInfo('CIRCUIT-BREAKER', 'Circuit Breaker restablecido a estado: CERRADO');

        // Mockear mhSender.enviarDTE para que falle con error de comunicación
        const originalEnviarDTE = mhSender.enviarDTE;
        mhSender.enviarDTE = async () => {
            printInfo('MOCK-MH', 'Simulando error de comunicación / timeout...');
            return {
                exito: false,
                mensaje: 'Error de comunicación',
                error: new Error('connect ETIMEDOUT'),
            };
        };

        let resStatusB = null;
        let resDataB = null;

        const reqB = {
            body: dteData,
            validatedBody: dteData,
            tenant,
            emisor,
        };

        const resB = {
            status: (code) => {
                resStatusB = code;
                return resB;
            },
            json: (data) => {
                resDataB = data;
                return resB;
            }
        };

        const nextB = (err) => {
            if (err) throw err;
        };

        await dteController.crearFactura(reqB, resB, nextB);

        if (resStatusB === 201 && resDataB && resDataB.datos.estado === 'CONTINGENCIA') {
            printPass('DTE creado exitosamente bajo modo contingencia indirecta (fallback de red).');
            console.log('   Mensaje:', resDataB.mensaje);
            console.log('   Código Generación:', resDataB.datos.codigoGeneracion);
        } else {
            throw new Error(`Fallo escenario B: Status esperado 201, recibido ${resStatusB}. Data: ${JSON.stringify(resDataB)}`);
        }

        // Restablecer mhSender.enviarDTE para el worker
        let enviadoExitosamente = false;
        mhSender.enviarDTE = async ({ codigoGeneracion }) => {
            printInfo('MOCK-MH', `Recibiendo transmisión diferida del DTE: ${codigoGeneracion}`);
            enviadoExitosamente = true;
            return {
                exito: true,
                estado: 'PROCESADO',
                selloRecibido: 'SELLO-MOCK-MH-123456',
                fechaProcesamiento: '07/06/2026 01:20:00',
            };
        };

        // =========================================================================
        // ESCENARIO C: Recuperación y Transmisión por el Contingency Worker
        // =========================================================================
        printHeader('ESCENARIO C: RECUPERACIÓN DE CONEXIÓN Y TRANSMISIÓN AUTOMÁTICA CON EL WORKER');

        printInfo('WORKER', 'Ejecutando ciclo del Contingency Worker...');
        const stats = await contingencyWorker.ejecutarCiclo();

        printPass(`Ciclo completado. Procesados: ${stats.procesados}, Exitosos: ${stats.exitosos}`);

        if (stats.exitosos >= 2) {
            printPass('El worker procesó y transmitió con éxito los dos documentos pendientes.');
        } else {
            printFail(`El worker no procesó todos los documentos esperados: ${JSON.stringify(stats)}`);
        }

        // Validar que los DTEs pasaron a estado PROCESADO en la BD
        const dteA_final = await prisma.dte.findUnique({ where: { id: dteA_db.id } });
        const dteB_final = await prisma.dte.findUnique({ where: { codigoGeneracion: resDataB.datos.codigoGeneracion } });

        if (dteA_final && dteA_final.status === 'PROCESADO' && dteA_final.selloRecibido === 'SELLO-MOCK-MH-123456') {
            printPass('DTE del Escenario A actualizado correctamente a PROCESADO con su sello.');
        } else {
            printFail('DTE del Escenario A no se actualizó correctamente a PROCESADO.', dteA_final);
        }

        if (dteB_final && dteB_final.status === 'PROCESADO' && dteB_final.selloRecibido === 'SELLO-MOCK-MH-123456') {
            printPass('DTE del Escenario B actualizado correctamente a PROCESADO con su sello.');
        } else {
            printFail('DTE del Escenario B no se actualizó correctamente a PROCESADO.', dteB_final);
        }

        // Restaurar enviarDTE original por seguridad
        mhSender.enviarDTE = originalEnviarDTE;

        printHeader('PRUEBAS COMPLETADAS CON ÉXITO');
        await prisma.$disconnect();
        process.exit(0);

    } catch (error) {
        printFail('Fallo en las pruebas de contingencia', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

testContingencia();
