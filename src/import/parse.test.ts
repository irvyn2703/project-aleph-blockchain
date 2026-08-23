import { describe, expect, it } from 'vitest';
import {
  findHeaderRowIndex,
  headerAlias,
  normHeader,
  num,
  parseGastosRows,
  parsePresupuestoRows,
} from './parse';

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

  it('saca símbolos de moneda y puntuación de encabezados oficiales, sin dejar guiones sueltos', () => {
    expect(normHeader('Importe \n$')).toBe('importe');
    expect(normHeader('Precios Costo Directo\n$')).toBe('precios_costo_directo');
    expect(normHeader('Clave          ó              No.')).toBe('clave_o_no');
    expect(normHeader('Cantidad           ó          Volumen')).toBe('cantidad_o_volumen');
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

  it('mapea los encabezados del presupuesto de obra pública oficial (formato jerárquico)', () => {
    expect(headerAlias('clave_o_no')).toBe('clave_concepto');
    expect(headerAlias('conceptos_de_trabajo')).toBe('descripcion');
    expect(headerAlias('unidad_de_medida')).toBe('um');
    expect(headerAlias('cantidad_o_volumen')).toBe('cantidad');
    expect(headerAlias('precios_costo_directo')).toBe('pu');
  });
});

describe('findHeaderRowIndex', () => {
  it('salta las filas de metadata y ubica el encabezado real', () => {
    const rows = [
      ['** PRESUPUESTO BASE**', '', '', '', '', ''],
      ['Nombre del Proyecto:', 'Rehabilitación de tanque', '', '', '', ''],
      ['Municipio:', 'Zongozotla', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['Clave ó No.', 'Conceptos de Trabajo', 'Unidad de Medida', 'Cantidad ó Volumen', 'Precios Costo Directo\n$', 'Importe \n$'],
      ['I', 'PRELIMINARES', '', '', '', 103931.63],
    ];
    expect(findHeaderRowIndex(rows)).toBe(4);
  });

  it('devuelve 0 cuando el encabezado ya está en la primera fila', () => {
    const rows = [['clave_partida', 'nombre_partida', 'clave_concepto', 'descripcion', 'um', 'cantidad', 'pu', 'importe']];
    expect(findHeaderRowIndex(rows)).toBe(0);
  });

  it('devuelve 0 como respaldo si ninguna fila tiene pinta de encabezado', () => {
    expect(findHeaderRowIndex([['a', 'b'], ['c', 'd']])).toBe(0);
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

describe('parsePresupuestoRows (formato jerárquico de obra pública)', () => {
  // Encabezados tal cual salen de un presupuesto oficial real (sin
  // clave_partida/nombre_partida: la partida es una fila propia, no una
  // columna repetida por concepto).
  const HEADERS = {
    clave: 'Clave ó No.',
    descripcion: 'Conceptos de Trabajo',
    um: 'Unidad de Medida',
    cantidad: 'Cantidad ó Volumen',
    pu: 'Precios Costo Directo\n$',
    importe: 'Importe \n$',
  };

  function fila(clave: string, descripcion: string, um: string, cantidad: number | '', pu: number | '', importe: number) {
    return {
      [HEADERS.clave]: clave,
      [HEADERS.descripcion]: descripcion,
      [HEADERS.um]: um,
      [HEADERS.cantidad]: cantidad,
      [HEADERS.pu]: pu,
      [HEADERS.importe]: importe,
    };
  }

  it('arma partidas a partir de las filas de sección (nombre + subtotal, sin cantidad/PU)', () => {
    const r = parsePresupuestoRows([
      fila('I', 'PRELIMINARES', '', '', '', 63996.24),
      fila('1000 06', 'Ruptura y demolición a mano', 'M3', 184.8, 346.3, 63996.24),
      fila('', 'OBRA DE DERIVACION', '', '', '', 796.3),
      fila('2282 077', 'Reducción campana galvanizada', 'PZA', 2, 398.15, 796.3),
    ]);
    expect(r.partidas).toHaveLength(2);
    expect(r.partidas[0]).toMatchObject({ clave: 'I', nombre: 'PRELIMINARES' });
    expect(r.partidas[0]!.conceptos).toHaveLength(1);
    expect(r.partidas[1]!.conceptos).toHaveLength(1);
  });

  it('sintetiza una clave (P1, P2…) para las partidas que no traen una propia', () => {
    const r = parsePresupuestoRows([
      fila('', 'OBRA DE DERIVACION', '', '', '', 796.3),
      fila('2282 077', 'Reducción campana galvanizada', 'PZA', 2, 398.15, 796.3),
    ]);
    expect(r.partidas[0]!.clave).toBe('P1');
  });

  it('permite claves de concepto repetidas dentro de una misma partida', () => {
    const r = parsePresupuestoRows([
      fila('I', 'PRELIMINARES', '', '', '', 200),
      fila('4090 02', 'Varilla 3/8"', 'KG', 10, 10, 100),
      fila('4090 02', 'Varilla 1/2"', 'KG', 10, 10, 100),
    ]);
    expect(r.partidas[0]!.conceptos).toHaveLength(2);
    expect(r.partidas[0]!.conceptos.map((c) => c.clave)).toEqual(['4090 02', '4090 02']);
  });

  it('ignora el bloque de totales final (su etiqueta cae en la columna de PU, no en la de descripción)', () => {
    const r = parsePresupuestoRows([
      fila('I', 'PRELIMINARES', '', '', '', 1000),
      fila('1000 06', 'Concepto', 'M3', 10, 100, 1000),
      { [HEADERS.clave]: '', [HEADERS.descripcion]: '', [HEADERS.um]: '', [HEADERS.cantidad]: '', [HEADERS.pu]: 'TOTAL COSTO DIRECTO', [HEADERS.importe]: 1000 },
      { [HEADERS.clave]: '', [HEADERS.descripcion]: '', [HEADERS.um]: '', [HEADERS.cantidad]: 0.1, [HEADERS.pu]: 'INDIRECTOS', [HEADERS.importe]: 100 },
    ]);
    expect(r.partidas).toHaveLength(1);
    expect(r.partidas[0]!.conceptos).toHaveLength(1);
  });

  it('avisa y usa cantidad × PU cuando el importe del Excel no coincide', () => {
    const r = parsePresupuestoRows([
      fila('I', 'PRELIMINARES', '', '', '', 999999),
      fila('1000 06', 'Concepto', 'M3', 10, 100, 999999),
    ]);
    expect(r.partidas[0]!.conceptos[0]!.importe).toBe(1000);
    expect(r.warnings.join(' ')).toContain('1000 06');
  });

  it('omite conceptos que aparecen antes de cualquier fila de partida', () => {
    const r = parsePresupuestoRows([
      fila('1000 06', 'Concepto huérfano', 'M3', 10, 100, 1000),
      fila('I', 'PRELIMINARES', '', '', '', 1000),
      fila('1000 07', 'Concepto normal', 'M3', 10, 100, 1000),
    ]);
    expect(r.partidas).toHaveLength(1);
    expect(r.partidas[0]!.conceptos).toHaveLength(1);
    expect(r.warnings.join(' ')).toContain('omitieron');
  });

  it('falla si no se arma ninguna partida', () => {
    expect(() =>
      parsePresupuestoRows([{ [HEADERS.clave]: '', [HEADERS.descripcion]: '', [HEADERS.um]: '', [HEADERS.cantidad]: '', [HEADERS.pu]: '', [HEADERS.importe]: '' }])
    ).toThrow('No se leyeron partidas');
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
