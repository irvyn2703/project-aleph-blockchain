import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import {
  parseGastosRows,
  parsePresupuestoRows,
  type ParsedGasto,
  type ParsedPresupuesto,
  type SheetRow,
} from './parse';

export type { ParsedGasto, ParsedPresupuesto };

/** Lee un .xlsx del filesystem y devuelve las filas de su primera hoja. */
async function readFirstSheet(fileUri: string): Promise<SheetRow[]> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(b64, { type: 'base64' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('El Excel no tiene hojas.');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('El Excel no tiene hojas.');
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
}

export async function parsePresupuestoXlsx(fileUri: string): Promise<ParsedPresupuesto> {
  return parsePresupuestoRows(await readFirstSheet(fileUri));
}

export async function parseGastosXlsx(
  fileUri: string
): Promise<{ gastos: ParsedGasto[]; warnings: string[] }> {
  return parseGastosRows(await readFirstSheet(fileUri));
}
