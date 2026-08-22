import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import type { Concepto } from '../types';

export type ParsedPresupuesto = {
  partidas: {
    clave: string;
    nombre: string;
    conceptos: Omit<Concepto, 'id' | 'partidaId'>[];
  }[];
  warnings: string[];
};

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

function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\./g, '');
}

function headerAlias(h: string): string {
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
    nombre: 'nombre_partida',
    nombre_partida: 'nombre_partida',
    clave_partida: 'clave_partida',
    clave_concepto: 'clave_concepto',
  };
  return map[h] ?? h;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function parsePresupuestoXlsx(fileUri: string): Promise<ParsedPresupuesto> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(b64, { type: 'base64' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('El Excel no tiene hojas.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new Error('La hoja está vacía.');

  const sample = rows[0];
  const keys = Object.keys(sample).map((k) => headerAlias(normHeader(k)));
  const missing = REQUIRED.filter((r) => !keys.includes(r));
  const warnings: string[] = [];
  if (missing.length) {
    warnings.push(`Faltan columnas: ${missing.join(', ')}. Se intentará mapear lo que haya.`);
  }

  const grouped = new Map<string, ParsedPresupuesto['partidas'][number]>();

  for (const raw of rows) {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      row[headerAlias(normHeader(k))] = v;
    }
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
    throw new Error('No se leyeron partidas. Usá columnas: clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe.');
  }
  return { partidas, warnings };
}
