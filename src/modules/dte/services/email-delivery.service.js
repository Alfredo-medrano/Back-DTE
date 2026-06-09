/**
 * ========================================
 * SERVICIO: ENVÍO DE CORREOS DTE
 * ========================================
 * Encargado de enviar las notificaciones de facturación.
 * Adjunta el JSON firmado legal (.json) y un enlace para el PDF.
 *
 * Cumple con ISO 9001 e ISO 22301 (asincronía fail-safe).
 */

const nodemailer = require('nodemailer');
const logger = require('../../../shared/logger');
const { generarPDF } = require('./pdf-generator.service');

// Configuración SMTP desde variables de entorno
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 2525;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || '"Factura DTE" <notificaciones@dte-saas.com>';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

let transporter = null;

// Inicializar el transporte solo si SMTP_HOST está configurado
if (smtpHost && smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true para 465, false para otros puertos
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });
    logger.info('SMTP: Servicio de envío de correos inicializado exitosamente.');
} else {
    logger.warn('SMTP: No se configuraron las variables SMTP. Las notificaciones por correo estarán deshabilitadas.');
}

/**
 * Compila la plantilla de correo premium e inserta los datos dinámicos.
 */
const generarPlantillaHtml = ({
    receptorNombre,
    emisorNombre,
    codigoGeneracion,
    numeroControl,
    fechaEmision,
    montoTotal,
    enlacePublico
}) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprobante de Documento Tributario Electrónico (DTE)</title>
    <style>
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
            background-color: #f1f5f9;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        .header {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            padding: 40px 32px;
            text-align: center;
            color: #ffffff;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }
        .header p {
            margin: 8px 0 0 0;
            color: #94a3b8;
            font-size: 14px;
        }
        .content {
            padding: 32px;
            color: #334155;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 12px;
        }
        .intro-text {
            font-size: 15px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .details-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 32px;
        }
        .details-table {
            width: 100%;
            border-collapse: collapse;
        }
        .details-table td {
            padding: 8px 0;
            font-size: 14px;
            vertical-align: top;
        }
        .label {
            color: #64748b;
            font-weight: 500;
            width: 45%;
        }
        .value {
            color: #0f172a;
            font-weight: 600;
            text-align: right;
        }
        .mono {
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
        }
        .divider {
            border-top: 1px dashed #cbd5e1;
            margin: 12px 0;
        }
        .total-label {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
            padding-top: 12px !important;
        }
        .total-value {
            font-size: 18px;
            font-weight: 700;
            color: #10b981;
            text-align: right;
            padding-top: 12px !important;
        }
        .btn-container {
            text-align: center;
            margin: 32px 0 24px 0;
        }
        .btn {
            background-color: #2563eb;
            color: #ffffff !important;
            padding: 14px 28px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
            text-decoration: none;
            display: inline-block;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
            transition: all 0.2s ease;
        }
        .legal-notice {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            background-color: #f1f5f9;
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #94a3b8;
        }
        .footer {
            background-color: #f8fafc;
            padding: 24px 32px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Documento Tributario Electrónico</h1>
            <p>Facturación Electrónica · El Salvador</p>
        </div>
        <div class="content">
            <div class="greeting">Estimado/a ${receptorNombre},</div>
            <div class="intro-text">
                Le informamos que <strong>${emisorNombre}</strong> ha emitido un documento tributario electrónico a su favor. Este comprobante ha sido debidamente procesado, validado y sellado de forma oficial por el Ministerio de Hacienda de El Salvador.
            </div>
            
            <div class="details-card">
                <table class="details-table">
                    <tr>
                        <td class="label">Código Generación:</td>
                        <td class="value mono">${codigoGeneracion}</td>
                    </tr>
                    <tr>
                        <td class="label">Número de Control:</td>
                        <td class="value mono">${numeroControl}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha de Emisión:</td>
                        <td class="value">${fechaEmision}</td>
                    </tr>
                    <tr>
                        <td colspan="2"><div class="divider"></div></td>
                    </tr>
                    <tr>
                        <td class="total-label">Monto Total a Pagar:</td>
                        <td class="total-value">$ ${montoTotal.toFixed(2)}</td>
                    </tr>
                </table>
            </div>

            <div class="btn-container">
                <a href="${enlacePublico}" class="btn" target="_blank">Ver Representación Gráfica (PDF)</a>
            </div>
            
            <div class="legal-notice">
                <strong>Nota Legal:</strong> Adjunto a este correo electrónico encontrará el archivo digital oficial en formato <strong>JSON firmado (.json)</strong>. Este archivo contiene la firma electrónica JWS y el sello del Ministerio de Hacienda, constituyendo el único documento fiscalmente válido en El Salvador.
            </div>
        </div>
        <div class="footer">
            Este es un correo automático. Por favor no responda directamente a este remitente.<br>
            Servicio de Facturación Electrónica multi-tenant. Cumple con ISO 27001 e ISO 27018.
        </div>
    </div>
</body>
</html>
    `;
};

/**
 * Envia el correo de forma asíncrona (Fire-and-Forget).
 * Si falla, se escribe en el log pero la ejecución principal no se ve interrumpida.
 *
 * @param {object} params
 * @param {object} params.dte - Registro DTE desde la base de datos (con receptor, jsonFirmado, etc.)
 * @param {object} params.emisor - Datos del emisor
 */
const enviarCorreoFactura = async ({ dte, emisor }) => {
    // Si no está habilitado SMTP, saltar
    if (!transporter) {
        logger.debug('SMTP: Envío de correo omitido (SMTP no configurado).', { codigoGeneracion: dte.codigoGeneracion });
        return;
    }

    // Normalizar datos soportando tanto objeto anidado (Request) como plano (DB Record)
    const codigoGeneracion = dte.codigoGeneracion;
    const numeroControl = dte.numeroControl;
    const jsonFirmado = dte.jsonFirmado;
    const fechaEmision = dte.fechaEmision;

    const receptorCorreo = dte.receptorCorreo || dte.receptor?.correo;
    const receptorNombre = dte.receptorNombre || dte.receptor?.nombre || 'Cliente Valorado';
    
    let total = 0.00;
    if (dte.totalPagar != null) {
        total = parseFloat(dte.totalPagar);
    } else if (dte.totales?.totalPagar != null) {
        total = parseFloat(dte.totales.totalPagar);
    } else if (dte.totales?.montoTotalOperacion != null) {
        total = parseFloat(dte.totales.montoTotalOperacion);
    }

    if (!receptorCorreo) {
        logger.debug('SMTP: DTE no tiene correo de receptor válido, omitiendo envío.', { codigoGeneracion });
        return;
    }

    // Fire-and-forget: envolver en promesa autónoma con catch completo
    Promise.resolve().then(async () => {
        try {
            logger.info('SMTP: Iniciando preparación de correo', {
                codigoGeneracion,
                destinatario: receptorCorreo
            });

            const linkPublico = `${frontendUrl}/facturas/public/${codigoGeneracion}`;
            const fechaFormateada = fechaEmision instanceof Date 
                ? fechaEmision.toLocaleDateString('es-SV') 
                : new Date(fechaEmision).toLocaleDateString('es-SV');

            const htmlContent = generarPlantillaHtml({
                receptorNombre,
                emisorNombre: emisor.nombre,
                codigoGeneracion,
                numeroControl,
                fechaEmision: fechaFormateada,
                montoTotal: total,
                enlacePublico: linkPublico
            });

            // 1. Convertir el jsonFirmado a string para el adjunto
            const jsonString = typeof jsonFirmado === 'string'
                ? jsonFirmado
                : JSON.stringify(jsonFirmado, null, 2);

            // 2. Generar representación gráfica (PDF)
            let pdfBuffer = null;
            try {
                // Recuperar el objeto completo DTE o armarlo si viene desde BD
                const dteRender = dte.documento || jsonFirmado || dte;
                pdfBuffer = await generarPDF(dteRender);
            } catch (pdfErr) {
                logger.error('SMTP: Error al generar PDF, se enviará sin adjunto gráfico', { error: pdfErr.message });
            }

            const attachments = [
                {
                    filename: `${codigoGeneracion}.json`,
                    content: jsonString,
                    contentType: 'application/json'
                }
            ];

            if (pdfBuffer) {
                attachments.push({
                    filename: `Factura_${codigoGeneracion}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                });
            }

            const mailOptions = {
                from: smtpFrom,
                to: receptorCorreo,
                subject: `Comprobante de Factura Electrónica — ${emisor.nombre}`,
                html: htmlContent,
                attachments
            };

            const info = await transporter.sendMail(mailOptions);
            logger.info('SMTP: Correo de factura enviado con éxito', {
                codigoGeneracion,
                messageId: info.messageId,
                destinatario: receptorCorreo
            });

        } catch (mailError) {
            logger.error('SMTP ERROR: Fallo al enviar correo de DTE', {
                codigoGeneracion,
                destinatario: receptorCorreo,
                error: mailError.message,
                stack: mailError.stack
            });
        }
    }).catch((fatalErr) => {
        logger.error('SMTP FATAL: Excepción no controlada en promesa de envío', {
            codigoGeneracion,
            error: fatalErr.message
        });
    });
};

module.exports = {
    enviarCorreoFactura,
};
