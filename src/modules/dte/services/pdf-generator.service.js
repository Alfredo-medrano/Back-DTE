/**
 * ========================================
 * SERVICIO: GENERADOR DE PDF Y QR
 * ========================================
 * Encargado de tomar el JSON estructurado,
 * generar el código QR de consulta pública,
 * y compilar un PDF formal con Puppeteer.
 */

const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const logger = require('../../../shared/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

/**
 * Extrae y normaliza el objeto DTE desde diferentes formatos posibles (JWS string, DB record, etc.)
 */
const extraerDteObj = (dte) => {
    if (!dte) return null;
    
    // Si ya es un objeto con identificacion (estructura DTE directa)
    if (typeof dte === 'object' && dte.identificacion) {
        return dte;
    }
    
    // Si es un registro de base de datos
    if (typeof dte === 'object') {
        if (dte.jsonOriginal) {
            const parsed = typeof dte.jsonOriginal === 'string' 
                ? JSON.parse(dte.jsonOriginal) 
                : dte.jsonOriginal;
            if (parsed && parsed.identificacion) return parsed;
        }
        if (dte.jsonFirmado) {
            return extraerDteObj(dte.jsonFirmado);
        }
        if (dte.documento && typeof dte.documento === 'object') {
            return dte.documento;
        }
    }
    
    // Si es un JWS string (3 partes separadas por puntos)
    if (typeof dte === 'string' && dte.includes('.')) {
        const parts = dte.split('.');
        if (parts.length === 3) {
            try {
                const payloadBase64 = parts[1];
                const payloadJson = Buffer.from(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
                const parsed = JSON.parse(payloadJson);
                if (parsed && parsed.identificacion) return parsed;
            } catch (e) {
                logger.error('Error decodificando payload JWS en extraerDteObj', { error: e.message });
            }
        }
    }
    
    // Si es un JSON string
    if (typeof dte === 'string') {
        try {
            const parsed = JSON.parse(dte);
            if (parsed && parsed.identificacion) return parsed;
        } catch (e) {
            // No es JSON válido
        }
    }
    
    return null;
};

/**
 * Genera un código QR en base64 para la URL de consulta pública.
 */
const generarCodigoQR = async (ambiente, codigoGeneracion, fechaEmision) => {
    try {
        const adminUrl = ambiente === '00' 
            ? 'https://admin.factura.gob.sv/consultaPublica' 
            : 'https://admin.factura.gob.sv/consultaPublica'; // MH no ha dado URL prod distinta todavía

        const urlConsulta = `${adminUrl}?ambiente=${ambiente}&codGen=${codigoGeneracion}&fechaEmi=${fechaEmision}`;
        
        // Generar Data URI del QR
        const qrDataUrl = await QRCode.toDataURL(urlConsulta, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 150,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        });
        
        return qrDataUrl;
    } catch (error) {
        logger.error('Error generando QR', { error: error.message });
        return null;
    }
};

/**
 * Plantilla HTML para Factura Electrónica
 */
const generarHTMLFactura = (dte, qrDataUrl) => {
    // Normalización de datos
    const identificacion = dte.identificacion || {};
    const emisor = dte.emisor || {};
    const receptor = dte.receptor || {};
    const cuerpo = dte.cuerpoDocumento || [];
    const resumen = dte.resumen || dte.totales || {};
    
    // Total
    const totalPagar = resumen.totalPagar !== undefined ? resumen.totalPagar : (resumen.montoTotalOperacion || 0);

    // Formato de tabla de ítems
    const htmlItems = cuerpo.map(item => `
        <tr>
            <td style="text-align: center;">${item.cantidad}</td>
            <td>${item.descripcion}</td>
            <td style="text-align: right;">$${(item.precioUni || 0).toFixed(2)}</td>
            <td style="text-align: right;">$${(item.montoDescu || 0).toFixed(2)}</td>
            <td style="text-align: right;">$${((item.ventaGravada || item.compra) || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 12px;
            color: #333;
            margin: 0;
            padding: 20px 40px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #1e293b;
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        .company-info h1 {
            margin: 0 0 5px 0;
            font-size: 20px;
            color: #1e293b;
            text-transform: uppercase;
        }
        .company-info p {
            margin: 2px 0;
            color: #64748b;
        }
        .document-info {
            text-align: right;
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .document-info h2 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #0f172a;
        }
        .document-info p {
            margin: 3px 0;
            font-size: 11px;
        }
        .bold { font-weight: bold; }
        
        .receptor-info {
            background: #f1f5f9;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .receptor-info h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th {
            background-color: #1e293b;
            color: white;
            padding: 10px;
            text-align: left;
            font-size: 11px;
        }
        td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .totals-container {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
        }
        .qr-section {
            width: 30%;
            text-align: center;
        }
        .qr-section img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 5px;
        }
        .totals-table {
            width: 40%;
        }
        .totals-table td {
            padding: 6px 10px;
            border: none;
        }
        .total-row {
            font-size: 16px;
            font-weight: bold;
            background-color: #f1f5f9;
            border-top: 2px solid #1e293b !important;
        }
        .total-row td {
            border-top: 2px solid #1e293b !important;
        }
        
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
        }
        .mh-seal {
            margin-top: 20px;
            padding: 15px;
            background-color: #ecfdf5;
            border: 1px solid #34d399;
            border-radius: 8px;
            text-align: center;
        }
        .mh-seal p {
            margin: 5px 0;
            color: #065f46;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-info">
            <h1>${emisor.nombreComercial || emisor.nombre}</h1>
            <p><span class="bold">Razón Social:</span> ${emisor.nombre}</p>
            <p><span class="bold">NIT:</span> ${emisor.nit} | <span class="bold">NRC:</span> ${emisor.nrc || 'N/A'}</p>
            <p><span class="bold">Actividad:</span> ${emisor.descActividad}</p>
            <p><span class="bold">Email:</span> ${emisor.correo}</p>
        </div>
        <div class="document-info">
            <h2>DOCUMENTO TRIBUTARIO ELECTRÓNICO</h2>
            <p><span class="bold">Tipo:</span> ${identificacion.tipoDte === '01' ? 'Factura Electrónica' : (identificacion.tipoDte === '03' ? 'Comprobante de Crédito Fiscal' : 'DTE-' + identificacion.tipoDte)}</p>
            <p><span class="bold">Código Generación:</span><br>${identificacion.codigoGeneracion}</p>
            <p><span class="bold">Número de Control:</span><br>${identificacion.numeroControl}</p>
            <p><span class="bold">Fecha Emisión:</span> ${identificacion.fecEmi} ${identificacion.horEmi}</p>
        </div>
    </div>

    <div class="receptor-info">
        <h3>Datos del Cliente</h3>
        <p><span class="bold">Nombre:</span> ${receptor?.nombre || 'Consumidor Final'}</p>
        <p><span class="bold">Documento:</span> ${receptor?.numDocumento || receptor?.nit || 'N/A'}</p>
        ${receptor?.nrc ? '<p><span class="bold">NRC:</span> ' + receptor.nrc + '</p>' : ''}
        ${receptor?.direccion ? '<p><span class="bold">Dirección:</span> ' + receptor.direccion.complemento + '</p>' : ''}
        ${receptor?.correo ? '<p><span class="bold">Email:</span> ' + receptor.correo + '</p>' : ''}
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 10%; text-align: center;">CANT</th>
                <th style="width: 45%;">DESCRIPCIÓN</th>
                <th style="width: 15%; text-align: right;">PRECIO UNI.</th>
                <th style="width: 15%; text-align: right;">DESC.</th>
                <th style="width: 15%; text-align: right;">TOTAL</th>
            </tr>
        </thead>
        <tbody>
            ${htmlItems}
        </tbody>
    </table>

    <div class="totals-container">
        <div class="qr-section">
            ${qrDataUrl ? '<img src="' + qrDataUrl + '" alt="Código QR MH">' : ''}
            <p style="font-size: 10px; color: #64748b; margin-top: 5px;">Escanee para consultar en línea</p>
        </div>
        <table class="totals-table">
            <tr>
                <td>Subtotal Ventas:</td>
                <td style="text-align: right;">$${(resumen.subTotalVentas || 0).toFixed(2)}</td>
            </tr>
            ${resumen.totalIva ? 
            '<tr>' +
                '<td>IVA (13%):</td>' +
                '<td style="text-align: right;">$' + resumen.totalIva.toFixed(2) + '</td>' +
            '</tr>' : ''}
            ${resumen.ivaPerci1 ? 
            '<tr>' +
                '<td>Percepción de IVA:</td>' +
                '<td style="text-align: right;">$' + resumen.ivaPerci1.toFixed(2) + '</td>' +
            '</tr>' : ''}
            <tr class="total-row">
                <td>TOTAL A PAGAR:</td>
                <td style="text-align: right;">$${totalPagar.toFixed(2)}</td>
            </tr>
        </table>
    </div>

    ${dte.selloRecibido ? 
    '<div class="mh-seal">' +
        '<p><span class="bold">Sello de Recepción MH:</span> ' + dte.selloRecibido + '</p>' +
        '<p style="font-size: 11px;">Este documento ha sido recibido y validado exitosamente por el Ministerio de Hacienda.</p>' +
    '</div>' : ''}

    <div class="footer">
        Representación gráfica de Documento Tributario Electrónico (DTE)<br>
        Resolución de Autorización MH. Generado automáticamente por Fac-Electronica SaaS.
    </div>
</body>
</html>
    `;
};

/**
 * Genera el Buffer del PDF usando Puppeteer
 */
const generarPDF = async (dte) => {
    try {
        const dteObj = extraerDteObj(dte);
        if (!dteObj) {
            throw new Error('No se pudo extraer una estructura DTE válida para la generación de PDF');
        }
        
        const identificacion = dteObj.identificacion || {};
        const fechaEmision = identificacion.fecEmi || new Date().toISOString().split('T')[0];
        
        // 1. Generar el código QR de consulta MH
        const qrDataUrl = await generarCodigoQR(
            identificacion.ambiente || '00',
            identificacion.codigoGeneracion,
            fechaEmision
        );

        // 2. Armar el HTML final
        const html = generarHTMLFactura(dteObj, qrDataUrl);

        // 3. Lanzar Puppeteer y renderizar PDF
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '20px',
                bottom: '20px',
                left: '20px',
                right: '20px'
            }
        });
        
        await browser.close();
        return pdfBuffer;

    } catch (error) {
        logger.error('Error generando PDF con Puppeteer', { error: error.message });
        throw error;
    }
};

module.exports = {
    generarPDF,
    generarCodigoQR,
    generarHTMLFactura
};
