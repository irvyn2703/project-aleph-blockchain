import type { Concepto } from '../types';

/**
 * Lógica pura de parseo de las filas ya extraídas del Excel.
 *
 * Vive separada de `xlsx.ts` porque ese módulo importa `expo-file-system`,
 * que no resuelve fuera de un runtime nativo.
 */

export type ParsedPresupuesto = {
  partidas: {
    clave: string;
    nombre: string;
    conceptos: Omit<Concepto, 'id' | 'partidaId'>[];
  }[];
  warnings: string[];
};

export type ParsedGasto = {
  clavePartida: string;
  monto: number;
  descripcion: string;
  fecha: string;
};

export type SheetRow = Record<string, unknown>;

const REQUIRED = [
  'clave_partida',
  'nombre_partida',
  'clave_concepto',
  'descripcion',
  'um',
  'cantidad',
  'pu',
  'importe',
] as const;

/** Normaliza un encabezado: sin acentos, minúsculas, espacios como guion bajo. */
export function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\./g, '');
}

/** Mapea variantes de encabezado al nombre canónico de columna. */
export function headerAlias(h: string): string {
  const map: Record<string, string> = {
    partida: 'clave_partida',
    clave: 'clave_concepto',
    descripcion: 'descripcion',
    um: 'um',
    u_m: 'um',
    unidad: 'um',
    cantidad: 'cantidad',
    cant: 'cantidad',
    pu: 'pu',
    p_u: 'pu',
    precio_unitario: 'pu',
    importe: 'importe',
    monto: 'monto',
    fecha: 'fecha',
    nombre: 'nombre_partida',
    nombre_partida: 'nombre_partida',
    clave_partida: 'clave_partida',
    clave_concepto: 'clave_concepto',
  };
  return map[h] ?? h;
}

/**
 * Convierte un valor de celda a número, asumiendo formato es-AR (`1.234,56`).
 * Devuelve 0 si no es interpretable: las filas sin datos se descartan antes.
 */
export function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Reescribe las claves de una fila a nombres canónicos de columna. */
function canonicalRow(raw: SheetRow): SheetRow {
  const row: SheetRow = {};
  for (const [k, v] of Object.entries(raw)) {
    row[headerAlias(normHeader(k))] = v;
  }
  return row;
}

/**
 * Agrupa las filas del presupuesto en partidas con sus conceptos.
 *
 * El importe se recalcula siempre como cantidad × PU: si el Excel trae un
 * importe que no coincide, se avisa y se usa el calculado. Es una app que
 * no puede reportar cifras que no puede justificar.
 */
export function parsePresupuestoRows(rows: SheetRow[]): ParsedPresupuesto {
  if (rows.length === 0) throw new Error('La hoja está vacía.');

  const warnings: string[] = [];
  const sample = rows[0];
  if (sample) {
    const keys = Object.keys(sample).map((k) => headerAlias(normHeader(k)));
    const missing = REQUIRED.filter((r) => !keys.includes(r));
    if (missing.length) {
      warnings.push(`Faltan columnas: ${missing.join(', ')}. Se intentará mapear lo que haya.`);
    }
  }

  const grouped = new Map<string, ParsedPresupuesto['partidas'][number]>();

  for (const raw of rows) {
    const row = canonicalRow(raw);
    const clavePartida = String(row.clave_partida ?? '').trim();
    const nombrePartida = String(row.nombre_partida ?? '').trim();
    const clave = String(row.clave_concepto ?? row.clave ?? '').trim();
    const descripcion = String(row.descripcion ?? '').trim();
    if (!clavePartida || !clave || !descripcion) continue;

    const cantidad = num(row.cantidad);
    const pu = num(row.pu);
    const importeExcel = num(row.importe);
    const importe = Number((cantidad * pu).toFixed(2));
    if (importeExcel && Math.abs(importeExcel - importe) > 0.05) {
      warnings.push(`${clave}: importe Excel ${importeExcel} ≠ cantidad×PU ${importe}. Se usa cantidad×PU.`);
    }

    let partida = grouped.get(clavePartida);
    if (!partida) {
      partida = { clave: clavePartida, nombre: nombrePartida || clavePartida, conceptos: [] };
      grouped.set(clavePartida, partida);
    }
    partida.conceptos.push({
      clave,
      descripcion,
      um: String(row.um ?? 'u').trim() || 'u',
      cantidad,
      pu,
      importe,
    });
  }

  const partidas = [...grouped.values()];
  if (partidas.length === 0) {
    throw new Error(
      'No se leyeron partidas. Usá columnas: clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe.'
    );
  }
  return { partidas, warnings };
}

/**
 * Lee las filas de gastos. `today` se inyecta para que el test sea
 * determinista: las filas sin fecha válida se fechan hoy.
 */
export function parseGastosRows(
  rows: SheetRow[],
  today: string = new Date().toISOString().slice(0, 10)
): { gastos: ParsedGasto[]; warnings: string[] } {
  if (rows.length === 0) throw new Error('La hoja está vacía.');

  const warnings: string[] = [];
  const gastos: ParsedGasto[] = [];

  for (const raw of rows) {
    const row = canonicalRow(raw);
    const clavePartida = String(row.clave_partida ?? row.partida ?? '').trim();
    const monto = num(row.monto ?? row.importe ?? row.cantidad);
    if (!clavePartida || !(monto > 0)) continue;
    const descripcion = String(row.descripcion ?? row.nombre ?? 'Gasto').trim() || 'Gasto';
    let fecha = String(row.fecha ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(fecha)) fecha = today;
    gastos.push({ clavePartida, monto, descripcion, fecha: fecha.slice(0, 10) });
  }

  if (gastos.length === 0) {
    throw new Error('No se leyeron gastos. Usá columnas: clave_partida, monto, descripcion, fecha (AAAA-MM-DD).');
  }
  return { gastos, warnings };
}
