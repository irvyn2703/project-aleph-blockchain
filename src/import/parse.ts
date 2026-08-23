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

/**
 * Normaliza un encabezado: sin acentos, minúsculas, espacios (incluidos
 * saltos de línea) como guion bajo, y sin puntuación ni símbolos de moneda
 * sueltos —los presupuestos de obra pública suelen traer encabezados como
 * "Importe \n$" o "Cantidad ó Volumen".
 */
export function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[.$#°:()]/g, '')
    .replace(/^_+|_+$/g, '');
}

/**
 * Mapea variantes de encabezado al nombre canónico de columna.
 *
 * Las entradas `clave_o_no`, `conceptos_de_trabajo`, `unidad_de_medida`,
 * `cantidad_o_volumen` y `precios_costo_directo` son los encabezados tal
 * cual salen de normalizar un presupuesto de obra pública oficial (formato
 * jerárquico, ver `parsePresupuestoJerarquico`), no del formato plano.
 */
export function headerAlias(h: string): string {
  const map: Record<string, string> = {
    partida: 'clave_partida',
    clave: 'clave_concepto',
    clave_o_no: 'clave_concepto',
    descripcion: 'descripcion',
    conceptos_de_trabajo: 'descripcion',
    um: 'um',
    u_m: 'um',
    unidad: 'um',
    unidad_de_medida: 'um',
    cantidad: 'cantidad',
    cant: 'cantidad',
    cantidad_o_volumen: 'cantidad',
    pu: 'pu',
    p_u: 'pu',
    precio_unitario: 'pu',
    precios_costo_directo: 'pu',
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
 * Ubica la fila de encabezado real dentro de una hoja leída como array de
 * arrays (una fila por celda, sin asumir dónde empieza la tabla).
 *
 * Los presupuestos de obra pública oficiales traen varias filas de
 * metadata (nombre del proyecto, región, municipio…) antes del encabezado,
 * así que no alcanza con asumir que es la primera fila. Se toma como
 * encabezado la primera fila cuyas celdas -normalizadas y con alias- cubren
 * al menos "descripción" e "importe", que están presentes tanto en la
 * plantilla plana como en la jerárquica. Si ninguna fila califica, se
 * asume la primera (comportamiento previo, para no romper hojas que ya
 * funcionaban).
 */
export function findHeaderRowIndex(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const fields = new Set((rows[i] ?? []).map((cell) => headerAlias(normHeader(cell))));
    if (fields.has('descripcion') && fields.has('importe')) return i;
  }
  return 0;
}

/**
 * Agrupa las filas del presupuesto en partidas con sus conceptos.
 *
 * Detecta el formato a partir de la primera fila: si trae una columna
 * `clave_partida` es el formato plano de la app (una fila por concepto, con
 * la partida repetida en cada una); si no, se asume el formato jerárquico
 * típico de un presupuesto de obra pública oficial (filas de partida con
 * subtotal, sin `clave_partida` propia, con sus conceptos debajo).
 */
export function parsePresupuestoRows(rows: SheetRow[]): ParsedPresupuesto {
  if (rows.length === 0) throw new Error('La hoja está vacía.');
  const sample = canonicalRow(rows[0]!);
  return 'clave_partida' in sample ? parsePresupuestoPlano(rows) : parsePresupuestoJerarquico(rows);
}

/**
 * Formato plano de la app: una fila por concepto, con `clave_partida` y
 * `nombre_partida` repetidos en cada fila de la misma partida.
 *
 * El importe se recalcula siempre como cantidad × PU: si el Excel trae un
 * importe que no coincide, se avisa y se usa el calculado. Es una app que
 * no puede reportar cifras que no puede justificar.
 */
function parsePresupuestoPlano(rows: SheetRow[]): ParsedPresupuesto {
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
 * Formato jerárquico de un presupuesto de obra pública oficial: no hay
 * columna de nombre de partida por fila, sino filas de partida (nombre +
 * subtotal, sin cantidad ni PU) seguidas de sus filas de concepto (clave,
 * descripción, um, cantidad, PU, importe). El agrupamiento se arma por
 * posición: cada fila de partida abre un grupo nuevo y los conceptos que
 * siguen caen ahí hasta la próxima fila de partida.
 *
 * Las filas del bloque de totales final (TOTAL COSTO DIRECTO, INDIRECTOS,
 * IVA…) no necesitan tratamiento aparte: su etiqueta cae en la columna de
 * PU o de importe, no en la de descripción, así que ya vienen sin
 * descripción y se descartan igual que una fila en blanco.
 */
function parsePresupuestoJerarquico(rows: SheetRow[]): ParsedPresupuesto {
  const warnings: string[] = [];
  const partidas: ParsedPresupuesto['partidas'] = [];
  let actual: ParsedPresupuesto['partidas'][number] | null = null;
  let contadorPartidas = 0;
  let conceptosSinPartida = 0;

  for (const raw of rows) {
    const row = canonicalRow(raw);
    const clave = String(row.clave_concepto ?? '').trim();
    const descripcion = String(row.descripcion ?? '').trim();
    if (!descripcion) continue; // fila en blanco o de metadata sin texto

    const cantidad = num(row.cantidad);
    const pu = num(row.pu);

    if (cantidad > 0 && pu > 0) {
      // Fila de concepto.
      if (!actual) {
        conceptosSinPartida++;
        continue;
      }
      const importeExcel = num(row.importe);
      const importe = Number((cantidad * pu).toFixed(2));
      if (importeExcel && Math.abs(importeExcel - importe) > 0.05) {
        warnings.push(
          `${clave || descripcion}: importe Excel ${importeExcel} ≠ cantidad×PU ${importe}. Se usa cantidad×PU.`
        );
      }
      actual.conceptos.push({
        clave: clave || `#${actual.conceptos.length + 1}`,
        descripcion,
        um: String(row.um ?? 'u').trim() || 'u',
        cantidad,
        pu,
        importe,
      });
      continue;
    }

    if (cantidad === 0 && pu === 0) {
      // Fila de partida: nombre con subtotal, sin cantidad ni PU. Muchas
      // partidas de estos presupuestos no traen clave propia (solo el
      // nombre), así que se sintetiza una a partir del orden de aparición.
      contadorPartidas++;
      actual = { clave: clave || `P${contadorPartidas}`, nombre: descripcion, conceptos: [] };
      partidas.push(actual);
      continue;
    }

    // Trae cantidad o PU pero no ambos: ni concepto completo ni fila de
    // partida. Se descarta con aviso en vez de adivinar un importe.
    warnings.push(`Fila ignorada (datos incompletos): ${descripcion}`);
  }

  if (conceptosSinPartida > 0) {
    warnings.push(
      `${conceptosSinPartida} concepto(s) aparecían antes de cualquier partida y se omitieron.`
    );
  }
  if (partidas.length === 0) {
    throw new Error(
      'No se leyeron partidas. Revisá que el Excel tenga secciones (partidas) con sus conceptos debajo.'
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
