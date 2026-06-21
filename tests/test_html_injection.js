/**
 * ========================================
 * PRUEBA DE SEGURIDAD: ESCAPE DE HTML
 * ========================================
 * Valida que los payloads maliciosos de inyección HTML / XSS
 * sean correctamente codificados a entidades seguras.
 */

const { escapeHtml } = require('../src/shared/utils/html-escape');
const { generarHTMLFactura } = require('../src/modules/dte/services/pdf-generator.service');

const runTests = () => {
    console.log('============================================================');
    console.log(' EJECUTANDO PRUEBA DE ESCAPE DE HTML ');
    console.log('============================================================');

    const payloadMalicioso = '<script>alert("XSS")</script> & <img src=x onerror=alert(1)>';
    const escapado = escapeHtml(payloadMalicioso);

    console.log('Payload Original:', payloadMalicioso);
    console.log('Payload Escapado:', escapado);

    if (escapado.includes('<') || escapado.includes('>') || escapado.includes('"') || escapado.includes("'")) {
        console.error('❌ FAIL: Caracteres HTML no escapados correctamente.');
        process.exit(1);
    }

    console.log('✓ PASS: Codificación de caracteres especiales exitosa.');

    // Simular un DTE con receptor malicioso
    const dteSimulado = {
        identificacion: {
            tipoDte: '01',
            codigoGeneracion: 'UUID-GEN-1234',
            numeroControl: 'CTRL-1234',
            fecEmi: '2026-06-21',
            horEmi: '12:00:00',
        },
        emisor: {
            nombre: 'Empresa Emisora',
            nit: '0614-000000-000-0',
            nrc: '1234-5',
            descActividad: 'Servicios de IT',
            correo: 'emisor@test.com',
        },
        receptor: {
            nombre: payloadMalicioso, // Inyección aquí
            numDocumento: '00000000-0',
            direccion: {
                complemento: payloadMalicioso, // Inyección aquí
            },
            correo: payloadMalicioso, // Inyección aquí
        },
        cuerpoDocumento: [
            {
                cantidad: 1,
                descripcion: payloadMalicioso, // Inyección aquí
                precioUni: 10.00,
                montoDescu: 0,
                ventaGravada: 10.00,
                ivaItem: 1.15
            }
        ],
        resumen: {
            totalGravada: 10.00,
            totalIva: 1.15,
            totalPagar: 11.15,
        }
    };

    const htmlResultado = generarHTMLFactura(dteSimulado, 'data:image/png;base64,QR');
    
    if (htmlResultado.includes(payloadMalicioso)) {
        console.error('❌ FAIL: HTML resultante contiene el payload original sin escapar.');
        process.exit(1);
    }

    if (!htmlResultado.includes('&lt;script&gt;')) {
        console.error('❌ FAIL: HTML resultante no codificó el script del receptor.');
        process.exit(1);
    }

    console.log('✓ PASS: Generación de plantilla de factura segura.');
    console.log('============================================================');
};

runTests();
