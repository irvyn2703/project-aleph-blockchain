import { describe, expect, it } from 'vitest';
import { headerAlias, normHeader, num, parseGastosRows, parsePresupuestoRows } from './parse';

describe('normHeader', () => {
  it('saca acentos, baja a minúsculas y une palabras con guion bajo', () => {
    expect(normHeader('Descripción')).toBe('descripcion');
    expect(normHeader('  Clave Partida  ')).toBe('clave_partida');
    expect(normHeader('P.U.')).toBe('pu');
    expect(normHeader('CANTIDAD')).toBe('cantidad');
  });

  it('tolera nulos y no-strings', () => {
    expect(normHeader(null)).toBe('');
    expect(normHeader(undefined)).toBe('');
    expect(normHeader(42)).toBe('42');
  });
});

describe('headerAlias', () => {
  it('mapea variantes al nombre canónico', () => {
    expect(headerAlias('partida')).toBe('clave_partida');
    expect(headerAlias('clave')).toBe('clave_concepto');
    expect(headerAlias('precio_unitario')).toBe('pu');
    expect(headerAlias('unidad')).toBe('um');
    expect(headerAlias('cant')).toBe('cantidad');
  });

  it('deja pasar sin cambios lo que no conoce', () => {
    expect(headerAlias('columna_rara')).toBe('columna_rara');
  });
});

describe('num', () => {
  it('lee el formato es-AR con punto de miles y coma decimal', () => {
    expect(num('1.234,56')).toBe(1234.56);
    expect(num('12.345.678,90')).toBe(12345678.9);
    expect(num('0,50')).toBe(0.5);
  });

  it('deja pasar los números que ya vienen tipados', () => {
    expect(num(1234.56)).toBe(1234.56);
    expect(num(0)).toBe(0);
  });

  it('devuelve 0 ante valores no interpretables', () => {
    expect(num('')).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('no es un número')).toBe(0);
    expect(num(NaN)).toBe(0);
  });

  it('ignora espacios intercalados', () => {
    expect(num(' 1.500,00 ')).toBe(1500);
  });
});

describe('parsePresupuestoRows', () => {
  const filaValida = {
    clave_partida: 'CIM-01',
    nombre_partida: 'Cimentación',
    clave_concepto: 'C-001',
    descripcion: 'Excavación manual',
    um: 'm3',
    cantidad: '10',
    pu: '1.500,00',
    importe: '15.000,00',
  };

  it('agrupa conceptos bajo su partida', () => {
    const r = parsePresupuestoRows([
      filaValida,
      { ...filaValida, clave_concepto: 'C-002', descripcion: 'Relleno', importe: '15.000,00' },
    ]);
    expect(r.partidas).toHaveLength(1);
    expect(r.partidas[0]!.clave).toBe('CIM-01');
    expect(r.partidas[0]!.conceptos).toHaveLength(2);
  });

  it('calcula el importe como cantidad × PU', () => {
    const r = parsePresupuestoRows([filaValida]);
    expect(r.partidas[0]!.conceptos[0]!.importe).toBe(15000);
    expect(r.warnings).toHaveLength(0);
  });

  it('avisa y usa cantidad × PU cuando el importe del Excel no coincide', () => {
    const r = parsePresupuestoRows([{ ...filaValida, importe: '99.999,00' }]);
    expect(r.partidas[0]!.conceptos[0]!.importe).toBe(15000);
    expect(r.warnings.join(' ')).toContain('C-001');
  });

  it('reconoce encabezados con acentos y mayúsculas', () => {
    const r = parsePresupuestoRows([
      {
        'Clave Partida': 'CIM-01',
        'Nombre Partida': 'Cimentación',
        Clave: 'C-001',
        'Descripción': 'Excavación',
        Unidad: 'm3',
        Cantidad: '2',
        'P.U.': '100',
        Importe: '200',
      },
    ]);
    expect(r.partidas[0]!.conceptos[0]!.um).toBe('m3');
    expect(r.partidas[0]!.conceptos[0]!.importe).toBe(200);
  });

  it('descarta filas sin clave de partida, concepto o descripción', () => {
    const r = parsePresupuestoRows([filaValida, { ...filaValida, clave_concepto: '' }, { ...filaValida, descripcion: '  ' }]);
    expect(r.partidas[0]!.conceptos).toHaveLength(1);
  });

  it('usa la clave como nombre cuando la partida no tiene nombre', () => {
    const r = parsePresupuestoRows([{ ...filaValida, nombre_partida: '' }]);
    expect(r.partidas[0]!.nombre).toBe('CIM-01');
  });

  it('avisa de las columnas faltantes', () => {
    const r = parsePresupuestoRows([
      { clave_partida: 'CIM-01', clave_concepto: 'C-001', descripcion: 'Algo', cantidad: 1, pu: 10 },
    ]);
    expect(r.warnings.join(' ')).toContain('Faltan columnas');
  });

  it('falla si la hoja está vacía', () => {
    expect(() => parsePresupuestoRows([])).toThrow('La hoja está vacía.');
  });

  it('falla si ninguna fila es aprovechable', () => {
    expect(() => parsePresupuestoRows([{ columna: 'irrelevante' }])).toThrow('No se leyeron partidas');
  });
});

describe('parseGastosRows', () => {
  const HOY = '2026-08-22';

  it('lee un gasto completo', () => {
    const { gastos } = parseGastosRows(
      [{ clave_partida: 'CIM-01', monto: '1.500,00', descripcion: 'Cemento', fecha: '2026-08-01' }],
      HOY
    );
    expect(gastos).toEqual([
      { clavePartida: 'CIM-01', monto: 1500, descripcion: 'Cemento', fecha: '2026-08-01' },
    ]);
  });

  it('fecha hoy los gastos con fecha ausente o inválida', () => {
    const { gastos } = parseGastosRows(
      [
        { clave_partida: 'CIM-01', monto: 100, descripcion: 'A' },
        { clave_partida: 'CIM-01', monto: 100, descripcion: 'B', fecha: '01/08/2026' },
      ],
      HOY
    );
    expect(gastos.map((g) => g.fecha)).toEqual([HOY, HOY]);
  });

  it('descarta filas sin partida o con monto no positivo', () => {
    const { gastos } = parseGastosRows(
      [
        { clave_partida: 'CIM-01', monto: 100, descripcion: 'Válido' },
        { clave_partida: '', monto: 100, descripcion: 'Sin partida' },
        { clave_partida: 'CIM-01', monto: 0, descripcion: 'Monto cero' },
        { clave_partida: 'CIM-01', monto: '-50', descripcion: 'Negativo' },
      ],
      HOY
    );
    expect(gastos).toHaveLength(1);
    expect(gastos[0]!.descripcion).toBe('Válido');
  });

  it('acepta "partida" e "importe" como alias', () => {
    const { gastos } = parseGastosRows([{ partida: 'CIM-01', importe: '250,00', descripcion: 'Flete' }], HOY);
    expect(gastos[0]!.clavePartida).toBe('CIM-01');
    expect(gastos[0]!.monto).toBe(250);
  });

  it('usa "Gasto" como descripción por defecto', () => {
    const { gastos } = parseGastosRows([{ clave_partida: 'CIM-01', monto: 100 }], HOY);
    expect(gastos[0]!.descripcion).toBe('Gasto');
  });

  it('falla si la hoja está vacía', () => {
    expect(() => parseGastosRows([], HOY)).toThrow('La hoja está vacía.');
  });

  it('falla si ninguna fila es aprovechable', () => {
    expect(() => parseGastosRows([{ columna: 'irrelevante' }], HOY)).toThrow('No se leyeron gastos');
  });
});
