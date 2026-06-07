import { describe, it, expect } from 'vitest';
const calculator = require('../dte-calculator.service');

describe('DTE Tax Calculator Service', () => {
    describe('redondear', () => {
        it('debe redondear valores fiscales a 2 decimales usando ROUND_HALF_UP', () => {
            expect(calculator.redondear(10.254)).toBe(10.25);
            expect(calculator.redondear(10.255)).toBe(10.26);
            expect(calculator.redondear(10.256)).toBe(10.26);
            expect(calculator.redondear(0)).toBe(0);
            expect(calculator.redondear(null)).toBe(0);
        });
    });

    describe('calcularLineaProducto', () => {
        it('debe calcular línea de producto para FE (DTE-01) - Precio unitario incluye IVA', () => {
            const item = {
                cantidad: 2,
                precioUni: 113.00, // incluye 13% de IVA ($100 base + $13 IVA)
                descuento: 0.00,
                codigo: 'PROD1',
                descripcion: 'Licencia Software',
            };

            const linea = calculator.calcularLineaProducto(item, 1, '01');

            expect(linea.numItem).toBe(1);
            expect(linea.cantidad).toBe(2);
            expect(linea.precioUni).toBe(113.00);
            expect(linea.ventaGravada).toBe(226.00);
            // IVAItem = 226 - (226 / 1.13) = 226 - 200 = 26
            expect(linea.ivaItem).toBe(26.00);
        });

        it('debe admitir inyección de IVA si el precio se ingresa sin IVA para FE (DTE-01)', () => {
            const item = {
                cantidad: 1,
                precioUni: 100.00, // ingresado sin IVA
                precioSinIva: true, // bandera de inyección
                descuento: 0.00,
                codigo: 'PROD1',
                descripcion: 'Licencia Software',
            };

            const linea = calculator.calcularLineaProducto(item, 1, '01');

            expect(linea.precioUni).toBe(113.00); // Se le suma el 13%
            expect(linea.ventaGravada).toBe(113.00);
            expect(linea.ivaItem).toBe(13.00);
        });

        it('debe calcular línea de producto para CCF (DTE-03) - Precio unitario excluye IVA', () => {
            const item = {
                cantidad: 2,
                precioUni: 100.00, // base sin IVA
                descuento: 0.00,
                codigo: 'PROD1',
                descripcion: 'Licencia Software',
            };

            const linea = calculator.calcularLineaProducto(item, 1, '03');

            expect(linea.precioUni).toBe(100.00);
            expect(linea.ventaGravada).toBe(200.00);
            expect(linea.ivaItem).toBeUndefined(); // CCF no lleva ivaItem en el detalle por norma de MH
        });
    });

    describe('calcularResumenFactura', () => {
        it('debe fallar en ventas a crédito (condicionOperacion: 2) si faltan plazo/periodo', () => {
            const lineas = [
                {
                    ventaGravada: 100.00,
                    ivaItem: 13.00,
                    montoDescu: 0.00,
                    ventaNoSuj: 0,
                    ventaExenta: 0
                }
            ];

            expect(() => {
                calculator.calcularResumenFactura(lineas, 2, '01', {});
            }).toThrow(/requiere plazo y periodo/);
        });

        it('debe calcular correctamente el resumen para FE (DTE-01) al contado', () => {
            const lineas = [
                {
                    ventaGravada: 113.00,
                    ivaItem: 13.00,
                    montoDescu: 0.00,
                    ventaNoSuj: 0,
                    ventaExenta: 0
                }
            ];

            const resumen = calculator.calcularResumenFactura(lineas, 1, '01', {});

            expect(resumen.totalGravada).toBe(113.00);
            expect(resumen.totalIva).toBe(13.00);
            expect(resumen.totalPagar).toBe(113.00);
            expect(resumen.condicionOperacion).toBe(1);
            expect(resumen.pagos[0].codigo).toBe('01'); // Efectivo por defecto
        });
    });

    describe('numeroALetras', () => {
        it('debe formatear cantidades monetarias en texto en español', () => {
            expect(calculator.numeroALetras(100.00)).toBe('CIEN 00/100 USD');
            expect(calculator.numeroALetras(123.45)).toBe('CIENTO VEINTE Y TRES 45/100 USD');
            expect(calculator.numeroALetras(1500.50)).toBe('MIL QUINIENTOS 50/100 USD');
        });
    });
});
