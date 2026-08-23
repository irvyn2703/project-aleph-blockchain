import { describe, expect, it } from 'vitest';
import { classifyDoc } from './classify';

describe('classifyDoc', () => {
  it('clasifica por extensión cuando no hay MIME type', () => {
    expect(classifyDoc('contrato.txt')).toBe('texto');
    expect(classifyDoc('memoria.md')).toBe('texto');
    expect(classifyDoc('plano.PNG')).toBe('imagen');
    expect(classifyDoc('comprobante.jpeg')).toBe('imagen');
    expect(classifyDoc('contrato.pdf')).toBe('pdf');
  });

  it('prioriza el MIME type sobre la extensión', () => {
    // El caso que rompía el OCR: Galería entrega archivos sin extensión.
    expect(classifyDoc('image:1000045', 'image/jpeg')).toBe('imagen');
    expect(classifyDoc('documento', 'text/plain')).toBe('texto');
    expect(classifyDoc('sin-nombre', 'application/pdf')).toBe('pdf');
  });

  it('acepta cualquier subtipo de imagen', () => {
    expect(classifyDoc('x', 'image/heic')).toBe('imagen');
    expect(classifyDoc('x', 'image/webp')).toBe('imagen');
  });

  it('tolera mayúsculas en el MIME type', () => {
    expect(classifyDoc('x', 'IMAGE/JPEG')).toBe('imagen');
  });

  it('marca como desconocido lo que no sabe procesar', () => {
    expect(classifyDoc('planilla.xlsx')).toBe('desconocido');
    expect(classifyDoc('contrato.docx')).toBe('desconocido');
    expect(classifyDoc('sin-extension')).toBe('desconocido');
    expect(classifyDoc('')).toBe('desconocido');
  });

  it('cae a la extensión si el MIME type es genérico', () => {
    // Android suele reportar application/octet-stream para archivos que sí
    // reconoce por nombre.
    expect(classifyDoc('contrato.txt', 'application/octet-stream')).toBe('texto');
    expect(classifyDoc('foto.jpg', 'application/octet-stream')).toBe('imagen');
  });
});
