import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import {
  findHeaderRowIndex,
  parseGastosRows,
  parsePresupuestoRows,
  type ParsedGasto,
  type ParsedPresupuesto,
  type SheetRow,
} from './parse';

export type { ParsedGasto, ParsedPresupuesto };

/**
 * Lee un .xlsx del filesystem y devuelve las filas de su primera hoja.
 *
 * El encabezado no siempre está en la primera fila: los presupuestos de
 * obra pública oficiales traen filas de metadata (nombre del proyecto,
 * región…) antes de la tabla. Se lee primero como array de arrays para
 * ubicar el encabezado real con `findHeaderRowIndex`, y recién ahí se arma
 * el objeto por fila a partir de esa posición.
 */
async function readFirstSheet(fileUri: string): Promise<SheetRow[]> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(b64, { type: 'base64' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('El Excel no tiene hojas.');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('El Excel no tiene hojas.');
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerRow = findHeaderRowIndex(aoa);
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '', range: headerRow });
}

export async function parsePresupuestoXlsx(fileUri: string): Promise<ParsedPresupuesto> {
  return parsePresupuestoRows(await readFirstSheet(fileUri));
}

export async function parseGastosXlsx(
  fileUri: string
): Promise<{ gastos: ParsedGasto[]; warnings: string[] }> {
  return parseGastosRows(await readFirstSheet(fileUri));
}
