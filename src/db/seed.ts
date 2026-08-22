import { getDb } from './client';
import { insertDocumento, replacePresupuesto, setObraNombre } from './queries';

export const CONTRATO_DEMO = `CONTRATO DE OBRA — Vivienda unifamiliar, Barrio Norte, CABA.

Artículo 8. Plazo de ejecución.
El Contratista se obliga a ejecutar y entregar la obra en un plazo de CIENTO OCHENTA (180) días corridos, contados desde el acta de inicio.

Artículo 9. Multas por mora.
Por cada semana o fracción de atraso en la entrega, el Contratista pagará una multa equivalente al CERO COMA CINCO POR CIENTO (0,5%) del monto total del contrato, hasta un tope del DIEZ POR CIENTO (10%).

Artículo 12. Alcance.
El contrato comprende cimentación, estructura de H° A°, albañilería y terminaciones según presupuesto adjunto. Quedan excluidos mobiliario y equipamiento de cocina.

Artículo 15. Anticipo.
Se abonará un anticipo del VEINTE POR CIENTO (20%) contra presentación de seguro de caución.`;

export const MEMORIA_DEMO = `MEMORIA DE CÁLCULO — Estructura de hormigón armado.

Hipótesis: reglamento CIRSOC 201. Hormigón H-21. Acero ADN 420.
Sobrecarga de uso en entrepiso: 200 kg/m². Cubierta: 100 kg/m² más nieve despreciable en CABA.
Cimentación: zapatas aisladas sobre suelo con tensión admisible de 1,5 kg/cm².
Losas macizas de 12 cm. Vigas principales 20x40 cm. Columnas 20x20 cm en planta baja.
El recubrimiento mínimo es de 2,5 cm en elementos interiores y 3 cm en contacto con el terreno.`;

export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  const obra = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM obra');
  if (obra && obra.c > 0) return;

  await setObraNombre('Vivienda unifamiliar — Barrio Norte');

  await replacePresupuesto([
    {
      clave: 'CIM-01',
      nombre: 'Cimentación',
      conceptos: [
        { clave: 'CIM-01-01', descripcion: 'Excavación manual en tierra', um: 'm3', cantidad: 45, pu: 18500, importe: 45 * 18500 },
        { clave: 'CIM-01-02', descripcion: 'Hormigón H-21 en zapatas', um: 'm3', cantidad: 18, pu: 142000, importe: 18 * 142000 },
        { clave: 'CIM-01-03', descripcion: 'Armadura ADN 420 en fundaciones', um: 'kg', cantidad: 2100, pu: 1850, importe: 2100 * 1850 },
      ],
    },
    {
      clave: 'EST-01',
      nombre: 'Estructura',
      conceptos: [
        { clave: 'EST-01-01', descripcion: 'Columnas H° A° 20x20', um: 'm3', cantidad: 6.4, pu: 168000, importe: 6.4 * 168000 },
        { clave: 'EST-01-02', descripcion: 'Vigas 20x40', um: 'm3', cantidad: 9.2, pu: 175000, importe: 9.2 * 175000 },
        { clave: 'EST-01-03', descripcion: 'Losa maciza e=12 cm', um: 'm2', cantidad: 86, pu: 42000, importe: 86 * 42000 },
      ],
    },
  ]);

  await insertDocumento({
    ruta: 'seed://contrato-demo.txt',
    tipo: 'legal',
    nombre: 'Contrato de obra (demo)',
    metadata: CONTRATO_DEMO,
    ragStatus: 'pendiente',
  });
  await insertDocumento({
    ruta: 'seed://memoria-demo.txt',
    tipo: 'memoria',
    nombre: 'Memoria de cálculo (demo)',
    metadata: MEMORIA_DEMO,
    ragStatus: 'pendiente',
  });
}
