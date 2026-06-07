import { describe, it, expect } from 'vitest';
const feBuilder = require('../fe.builder');

const emisorMock = {
    nit: '06140000000000',
    nrc: '1234567',
    nombre: 'EMPRESA EMISORA S.A. DE C.V.',
    codActividad: '62010',
    descActividad: 'PROGRAMACION INFORMATICA',
    complemento: 'COLONIA ESCALON',
    telefono: '22222222',
    correo: 'emisor@example.com',
    codEstableMH: 'M001',
    codPuntoVentaMH: 'P001',
    ambiente: '00',
};

const itemsMock = [
    {
        numItem: 1,
        tipoItem: 1,
        cantidad: 2,
        codigo: 'P001',
        descripcion: 'Servicio de desarrollo',
        uniMedida: 59,
        precioUni: 113.00, // incluye IVA (13%)
        montoDescu: 0.00,
    }
];

describe('DTE-01 (Factura Electrónica) Builder', () => {
    it('debe construir un documento FE válido con campos obligatorios', () => {
        const doc = feBuilder.construir({
            emisor: emisorMock,
            receptor: {
                nombre: 'Cliente de Prueba',
                tipoDocumento: '36',
                numDocumento: '06140101011012',
            },
            items: itemsMock,
            correlativo: 1,
        });

        expect(doc.identificacion).toBeDefined();
        expect(doc.identificacion.tipoDte).toBe('01');
        expect(doc.emisor.nit).toBe(emisorMock.nit);
        expect(doc.receptor.nombre).toBe('CLIENTE DE PRUEBA');
        expect(doc.cuerpoDocumento.length).toBe(1);
        expect(doc.resumen).toBeDefined();
    });

    it('debe fallar si el monto total >= $1095 y no se proporciona receptor con documento', () => {
        const granItemsMock = [
            {
                numItem: 1,
                tipoItem: 1,
                cantidad: 10,
                codigo: 'P002',
                descripcion: 'Servidor Premium',
                uniMedida: 59,
                precioUni: 150.00, // Total = $1500 (>= $1095)
                montoDescu: 0.00,
            }
        ];

        expect(() => {
            feBuilder.construir({
                emisor: emisorMock,
                receptor: null, // Sin receptor
                items: granItemsMock,
                correlativo: 2,
            });
        }).toThrow(/requiere receptor con tipoDocumento/);
    });

    it('debe formatear DUI y NIT correctamente en el receptor', () => {
        // DUI con guión
        const docDui = feBuilder.construir({
            emisor: emisorMock,
            receptor: {
                nombre: 'Receptor DUI',
                tipoDocumento: '13',
                numDocumento: '123456789', // 9 dígitos sin guión
            },
            items: itemsMock,
            correlativo: 3,
        });
        expect(docDui.receptor.numDocumento).toBe('12345678-9');

        // NIT sin guión
        const docNit = feBuilder.construir({
            emisor: emisorMock,
            receptor: {
                nombre: 'Receptor NIT',
                tipoDocumento: '36',
                numDocumento: '0614-010101-101-2', // NIT con guiones
            },
            items: itemsMock,
            correlativo: 4,
        });
        expect(docNit.receptor.numDocumento).toBe('06140101011012'); // Sin guiones
    });
});
