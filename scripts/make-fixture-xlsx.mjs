import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join } from 'path';

const rows = [
  { clave_partida: 'CIM-01', nombre_partida: 'Cimentación', clave_concepto: 'CIM-01-01', descripcion: 'Excavación manual en tierra', um: 'm3', cantidad: 45, pu: 18500, importe: 832500 },
  { clave_partida: 'CIM-01', nombre_partida: 'Cimentación', clave_concepto: 'CIM-01-02', descripcion: 'Hormigón H-21 en zapatas', um: 'm3', cantidad: 18, pu: 142000, importe: 2556000 },
  { clave_partida: 'CIM-01', nombre_partida: 'Cimentación', clave_concepto: 'CIM-01-03', descripcion: 'Armadura ADN 420 en fundaciones', um: 'kg', cantidad: 2100, pu: 1850, importe: 3885000 },
  { clave_partida: 'EST-01', nombre_partida: 'Estructura', clave_concepto: 'EST-01-01', descripcion: 'Columnas H° A° 20x20', um: 'm3', cantidad: 6.4, pu: 168000, importe: 1075200 },
  { clave_partida: 'EST-01', nombre_partida: 'Estructura', clave_concepto: 'EST-01-02', descripcion: 'Vigas 20x40', um: 'm3', cantidad: 9.2, pu: 175000, importe: 1610000 },
  { clave_partida: 'EST-01', nombre_partida: 'Estructura', clave_concepto: 'EST-01-03', descripcion: 'Losa maciza e=12 cm', um: 'm2', cantidad: 86, pu: 42000, importe: 3612000 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'presupuesto');
const out = join(process.cwd(), 'assets', 'fixtures', 'presupuesto.xlsx');
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('wrote', out);
