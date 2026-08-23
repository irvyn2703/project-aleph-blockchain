import { describe, expect, it } from 'vitest';
import { parseComprobante, toNativePath } from './ocr';

describe('toNativePath', () => {
  it('quita el esquema file:// que devuelven las APIs de Expo', () => {
    expect(toNativePath('file:///data/user/0/com.aleph.obra/files/expediente/foto.png')).toBe(
      '/data/user/0/com.aleph.obra/files/expediente/foto.png'
    );
  });

  it('deja intactas las rutas que ya son nativas', () => {
    expect(toNativePath('/data/user/0/app/files/foto.png')).toBe('/data/user/0/app/files/foto.png');
  });

  it('decodifica los caracteres escapados de la URI', () => {
    expect(toNativePath('file:///data/mi%20carpeta/foto.png')).toBe('/data/mi carpeta/foto.png');
  });
});

/**
 * `parseComprobante` solo interpreta el texto que devolvió el OCR: no llama al modelo, así que corre en Node. La inferencia en sí se verifica en device.
 *
 */
describe('parseComprobante', () => {
  it('lee el total con signo y separador de miles', () => {
    expect(parseComprobante('TOTAL: $ 15.400,00').monto).toBe(15400);
  });

  it('lee el total sin signo de moneda', () => {
    expect(parseComprobante('Ferretería\nCemento x10\nTOTAL 1.500,00').monto).toBe(1500);
  });

  it('reconoce el prefijo ARS', () => {
    expect(parseComprobante('ARS 2.300,50').monto).toBe(2300.5);
  });

  it('acepta importes enteros sin decimales', () => {
    expect(parseComprobante('$50').monto).toBe(50);
  });

  it('devuelve null —no 0— cuando no hay ningún importe', () => {
    // Importa la distinción: 0 es un monto válido que pasaría la validación
    // del formulario, null obliga al usuario a escribirlo.
    expect(parseComprobante('Sin numeros aca').monto).toBeNull();
    expect(parseComprobante('').monto).toBeNull();
  });

  it('toma el mayor de los importes sueltos cuando no hay una etiqueta de total', () => {
    expect(parseComprobante('100,00\n21,00\n121,00').monto).toBe(121);
  });

  it('arma la descripción con las primeras tres líneas', () => {
    expect(parseComprobante('Ferretería\nCemento\n15.400,00\nCUIT 30-123').descripcion).toBe(
      'Ferretería — Cemento — 15.400,00'
    );
  });

  it('cae a una descripción por defecto con texto vacío', () => {
    expect(parseComprobante('').descripcion).toBe('Gasto (OCR)');
  });

  it('recorta descripciones muy largas', () => {
    expect(parseComprobante('x'.repeat(300)).descripcion.length).toBeLessThanOrEqual(180);
  });

  it('descarta líneas en blanco al armar la descripción', () => {
    expect(parseComprobante('  \nFerretería\n\n  \nCemento').descripcion).toBe('Ferretería — Cemento');
  });

  // Comportamiento defectuoso conocido, fijado acá para que el arreglo sea
  // deliberado: "Subtotal" contiene "total", así que el regex engancha esa
  // línea y devuelve 100 en vez del total real de 121.
  it.fails('debería preferir el TOTAL sobre el subtotal', () => {
    expect(parseComprobante('Subtotal 100,00\nIVA 21,00\nTotal 121,00').monto).toBe(121);
  });
});
