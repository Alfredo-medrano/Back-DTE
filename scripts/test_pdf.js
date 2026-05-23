/**
 * ========================================
 * TEST: GENERACIÓN DE PDF Y QR
 * ========================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generarPDF } = require('../src/modules/dte/services/pdf-generator.service');

const dteTest = {
    identificacion: {
        version: 1,
        ambiente: '00',
        tipoDte: '01',
        numeroControl: 'DTE-01-M001P001-000000000000001',
        codigoGeneracion: 'B2573C60-CBB7-4A90-A8E0-310560804F58',
        fecEmi: '2026-05-22',
        horEmi: '04:30:00'
    },
    emisor: {
        nit: '070048272',
        nrc: '3799647',
        nombre: 'ALFREDO EZEQUIEL MEDRANO MARTINEZ',
        nombreComercial: 'ALZETECH',
        descActividad: 'PROGRAMACION INFORMATICA',
        correo: 'facturacion@alzetech.com'
    },
    receptor: {
        nombre: 'CLIENTE DE PRUEBAS',
        numDocumento: '12345678-9',
        correo: 'cliente@test.com'
    },
    cuerpoDocumento: [
        {
            cantidad: 1,
            descripcion: 'Suscripción SaaS Anual',
            precioUni: 113.00,
            montoDescu: 0,
            ventaGravada: 113.00
        }
    ],
    resumen: {
        subTotalVentas: 113.00,
        totalIva: 13.00,
        totalPagar: 113.00
    },
    selloRecibido: '2026B098639BE2E84F5AA8E27B487350C1E8KC8W'
};

async function testPDF() {
    try {
        console.log('Generando PDF...');
        const pdfBuffer = await generarPDF(dteTest);
        
        const outputPath = path.join(__dirname, `Factura_${dteTest.identificacion.codigoGeneracion}.pdf`);
        fs.writeFileSync(outputPath, pdfBuffer);
        
        console.log(`✅ PDF generado exitosamente en: ${outputPath}`);
    } catch (error) {
        console.error('❌ Error generando PDF:', error);
    }
}

testPDF();
