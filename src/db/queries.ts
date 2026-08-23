import type { Concepto, Documento, DocumentoTipo, Gasto, Partida, PartidaConConceptos } from '../types';
import { getDb } from './client';

export async function getObraNombre(): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ nombre: string }>('SELECT nombre FROM obra WHERE id = 1');
  return row?.nombre ?? 'Sin presupuesto cargado';
}

export async function setObraNombre(nombre: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO obra (id, nombre) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre',
    nombre
  );
}

export async function listPartidas(): Promise<Partida[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; clave: string; nombre: string }>(
    'SELECT id, clave, nombre FROM partidas ORDER BY clave'
  );
  return rows;
}

export async function listPresupuesto(): Promise<PartidaConConceptos[]> {
  const db = await getDb();
  const partidas = await listPartidas();
  const conceptos = await db.getAllAsync<{
    id: number;
    partida_id: number;
    clave: string;
    descripcion: string;
    um: string;
    cantidad: number;
    pu: number;
    importe: number;
  }>('SELECT id, partida_id, clave, descripcion, um, cantidad, pu, importe FROM conceptos ORDER BY clave');

  return partidas.map((p) => {
    const items: Concepto[] = conceptos
      .filter((c) => c.partida_id === p.id)
      .map((c) => ({
        id: c.id,
        partidaId: c.partida_id,
        clave: c.clave,
        descripcion: c.descripcion,
        um: c.um,
        cantidad: c.cantidad,
        pu: c.pu,
        importe: c.importe,
      }));
    return {
      ...p,
      conceptos: items,
      importe: items.reduce((acc, c) => acc + c.importe, 0),
    };
  });
}

export async function totalObra(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(importe), 0) AS total FROM conceptos');
  return row?.total ?? 0;
}

export async function findPartida(claveONombre: string): Promise<{
  partida: Partida;
  importe: number;
  gastado: number;
  conceptos: Concepto[];
} | null> {
  const db = await getDb();
  const q = claveONombre.trim().toLowerCase();
  const partida = await db.getFirstAsync<{ id: number; clave: string; nombre: string }>(
    `SELECT id, clave, nombre FROM partidas
     WHERE lower(clave) = ? OR lower(nombre) LIKE ?
     ORDER BY CASE WHEN lower(clave) = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    q,
    `%${q}%`,
    q
  );
  if (!partida) return null;

  const conceptosRows = await db.getAllAsync<{
    id: number;
    partida_id: number;
    clave: string;
    descripcion: string;
    um: string;
    cantidad: number;
    pu: number;
    importe: number;
  }>('SELECT id, partida_id, clave, descripcion, um, cantidad, pu, importe FROM conceptos WHERE partida_id = ?', partida.id);

  const conceptos: Concepto[] = conceptosRows.map((c) => ({
    id: c.id,
    partidaId: c.partida_id,
    clave: c.clave,
    descripcion: c.descripcion,
    um: c.um,
    cantidad: c.cantidad,
    pu: c.pu,
    importe: c.importe,
  }));

  const gastadoRow = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE partida_id = ?',
    partida.id
  );

  return {
    partida,
    importe: conceptos.reduce((acc, c) => acc + c.importe, 0),
    gastado: gastadoRow?.total ?? 0,
    conceptos,
  };
}

export async function buscarConceptos(query: string): Promise<(Concepto & { partidaClave: string; partidaNombre: string })[]> {
  const db = await getDb();
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = await db.getAllAsync<{
    id: number;
    partida_id: number;
    clave: string;
    descripcion: string;
    um: string;
    cantidad: number;
    pu: number;
    importe: number;
    partida_clave: string;
    partida_nombre: string;
  }>(
    `SELECT c.id, c.partida_id, c.clave, c.descripcion, c.um, c.cantidad, c.pu, c.importe,
            p.clave AS partida_clave, p.nombre AS partida_nombre
     FROM conceptos c
     JOIN partidas p ON p.id = c.partida_id
     WHERE lower(c.descripcion) LIKE ? OR lower(c.clave) LIKE ?
     LIMIT 12`,
    q,
    q
  );
  return rows.map((c) => ({
    id: c.id,
    partidaId: c.partida_id,
    clave: c.clave,
    descripcion: c.descripcion,
    um: c.um,
    cantidad: c.cantidad,
    pu: c.pu,
    importe: c.importe,
    partidaClave: c.partida_clave,
    partidaNombre: c.partida_nombre,
  }));
}

export async function gastadoVsPresupuesto(partidaQuery?: string): Promise<{
  presupuesto: number;
  gastado: number;
  desvio: number;
  partida: Partida | null;
}> {
  if (partidaQuery && partidaQuery.trim()) {
    const found = await findPartida(partidaQuery);
    if (!found) {
      return { presupuesto: 0, gastado: 0, desvio: 0, partida: null };
    }
    return {
      presupuesto: found.importe,
      gastado: found.gastado,
      desvio: found.gastado - found.importe,
      partida: found.partida,
    };
  }

  const presupuesto = await totalObra();
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(monto), 0) AS total FROM gastos');
  const gastado = row?.total ?? 0;
  return { presupuesto, gastado, desvio: gastado - presupuesto, partida: null };
}

export async function replacePresupuesto(
  partidas: { clave: string; nombre: string; conceptos: Omit<Concepto, 'id' | 'partidaId'>[] }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM gastos; DELETE FROM conceptos; DELETE FROM partidas;');
    for (const partida of partidas) {
      const result = await db.runAsync(
        'INSERT INTO partidas (clave, nombre) VALUES (?, ?)',
        partida.clave,
        partida.nombre
      );
      const partidaId = result.lastInsertRowId;
      for (const c of partida.conceptos) {
        await db.runAsync(
          `INSERT INTO conceptos (partida_id, clave, descripcion, um, cantidad, pu, importe)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          partidaId,
          c.clave,
          c.descripcion,
          c.um,
          c.cantidad,
          c.pu,
          c.importe
        );
      }
    }
  });
}

export async function listGastos(): Promise<(Gasto & { partidaClave: string; partidaNombre: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    partida_id: number;
    monto: number;
    descripcion: string;
    ruta_comprobante: string | null;
    fecha: string;
    ocr_raw: string | null;
    partida_clave: string;
    partida_nombre: string;
  }>(
    `SELECT g.*, p.clave AS partida_clave, p.nombre AS partida_nombre
     FROM gastos g JOIN partidas p ON p.id = g.partida_id
     ORDER BY g.fecha DESC, g.id DESC`
  );
  return rows.map((g) => ({
    id: g.id,
    partidaId: g.partida_id,
    monto: g.monto,
    descripcion: g.descripcion,
    rutaComprobante: g.ruta_comprobante,
    fecha: g.fecha,
    ocrRaw: g.ocr_raw,
    partidaClave: g.partida_clave,
    partidaNombre: g.partida_nombre,
  }));
}

export async function replaceGastos(
  items: {
    clavePartida: string;
    monto: number;
    descripcion: string;
    fecha: string;
  }[]
): Promise<{ inserted: number; skipped: string[] }> {
  const db = await getDb();
  const skipped: string[] = [];
  let inserted = 0;
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM gastos;');
    for (const item of items) {
      const partida = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM partidas WHERE lower(clave) = ?',
        item.clavePartida.trim().toLowerCase()
      );
      if (!partida) {
        skipped.push(item.clavePartida || '(sin clave)');
        continue;
      }
      await db.runAsync(
        `INSERT INTO gastos (partida_id, monto, descripcion, ruta_comprobante, fecha, ocr_raw)
         VALUES (?, ?, ?, NULL, ?, NULL)`,
        partida.id,
        item.monto,
        item.descripcion,
        item.fecha
      );
      inserted += 1;
    }
  });
  return { inserted, skipped: [...new Set(skipped)] };
}

export async function insertGasto(input: {
  partidaId: number;
  monto: number;
  descripcion: string;
  rutaComprobante: string | null;
  fecha: string;
  ocrRaw: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO gastos (partida_id, monto, descripcion, ruta_comprobante, fecha, ocr_raw)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.partidaId,
    input.monto,
    input.descripcion,
    input.rutaComprobante,
    input.fecha,
    input.ocrRaw
  );
  return result.lastInsertRowId;
}

export async function listDocumentos(): Promise<Documento[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    ruta: string;
    fecha_subida: string;
    tipo: DocumentoTipo;
    nombre: string;
    metadata: string | null;
    rag_status: Documento['ragStatus'];
  }>('SELECT * FROM documentos ORDER BY fecha_subida DESC, id DESC');
  return rows.map((d) => ({
    id: d.id,
    ruta: d.ruta,
    fechaSubida: d.fecha_subida,
    tipo: d.tipo,
    nombre: d.nombre,
    metadata: d.metadata,
    ragStatus: d.rag_status,
  }));
}

export async function insertDocumento(input: {
  ruta: string;
  tipo: DocumentoTipo;
  nombre: string;
  metadata: string | null;
  ragStatus: Documento['ragStatus'];
}): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO documentos (ruta, fecha_subida, tipo, nombre, metadata, rag_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.ruta,
    new Date().toISOString(),
    input.tipo,
    input.nombre,
    input.metadata,
    input.ragStatus
  );
  return result.lastInsertRowId;
}

export async function updateDocumentoRag(id: number, ragStatus: Documento['ragStatus'], metadata?: string): Promise<void> {
  const db = await getDb();
  if (metadata != null) {
    await db.runAsync('UPDATE documentos SET rag_status = ?, metadata = ? WHERE id = ?', ragStatus, metadata, id);
  } else {
    await db.runAsync('UPDATE documentos SET rag_status = ? WHERE id = ?', ragStatus, id);
  }
}

export async function listDocumentosTexto(): Promise<{ nombre: string; tipo: DocumentoTipo; texto: string }[]> {
  const docs = await listDocumentos();
  return docs
    .filter((d) => d.metadata && d.metadata.trim().length > 0)
    .map((d) => ({ nombre: d.nombre, tipo: d.tipo, texto: d.metadata as string }));
}
