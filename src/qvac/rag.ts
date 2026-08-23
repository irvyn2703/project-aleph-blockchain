import { embed, ragChunk, ragCloseWorkspace, ragDeleteEmbeddings, ragSaveEmbeddings, ragSearch } from '@qvac/sdk';
import { listDocumentos, updateDocumentoRag } from '../db/queries';
import { ensureEmbeddings, type ProgressHandler } from './models';

export const RAG_WORKSPACE = 'obra-expediente';

/**
 * Identidad del modelo de embeddings tal como la persiste la base RAG.
 *
 * NO usar el `modelId` que devuelve `loadModel()`: ese es un handle de sesión
 * y cambia en cada carga. `ragIngest` lo pasa tal cual como `embeddingModelId`
 * (ver `rag-hyperdb/handlers/ingest.js`), y la base lo guarda en su config y lo
 * compara contra cada ingesta posterior; al reiniciar el proceso el handle
 * nuevo no coincidía con el guardado y todo fallaba con
 * EMBEDDING_MODEL_MISMATCH, aunque el modelo fuera el mismo de siempre.
 *
 * Al ir por el flujo segregado (chunk → embed → saveEmbeddings) elegimos
 * nosotros este valor, que solo debe cambiar si cambia el modelo de verdad.
 */
const EMBEDDING_MODEL_ID = 'gte-large-fp16';

/**
 * Las bases creadas antes del cambio guardaron como `embeddingModelId` el
 * handle de sesión de turno, así que su config nunca va a coincidir con
 * EMBEDDING_MODEL_ID. Se detecta por el error del propio SDK y se resuelve
 * tirando el workspace: son embeddings derivados del expediente, la fuente
 * (los documentos y su texto) vive en SQLite y `ingestSeedDocs` los reingesta.
 * Una sola vez: al recrearse, la config ya queda con el id estable.
 */
function isStaleModelIdError(e: unknown): boolean {
  return e instanceof Error && /Embedding model mismatch/i.test(e.message);
}

/**
 * Ingesta texto al índice RAG y devuelve los ids de los chunks guardados
 * (un documento largo puede partirse en varios). Quien llama tiene que
 * persistir esos ids —en `documentos.rag_chunk_ids`— porque son la única
 * forma de encontrarlos después: no hay búsqueda por id de documento propio,
 * solo por contenido o por el id de cada chunk. Sin guardarlos, borrar o
 * reemplazar un documento no puede sacar su texto viejo del índice.
 */
export async function ingestExpedienteText(
  id: string,
  text: string,
  onProgress?: ProgressHandler
): Promise<string[]> {
  try {
    return await saveChunks(id, text, onProgress);
  } catch (e) {
    if (!isStaleModelIdError(e)) throw e;
    // Cerrar y borrar en un solo paso: la ingesta que acaba de fallar dejó el
    // workspace abierto, y `ragDeleteWorkspace` sobre uno abierto se rechaza
    // con "is currently in use". Si el cierre falla igual reintentamos: lo que
    // importa es el error del reintento, no el del cierre.
    await ragCloseWorkspace({ workspace: RAG_WORKSPACE, deleteOnClose: true }).catch(() => undefined);
    return await saveChunks(id, text, onProgress);
  }
}

async function saveChunks(id: string, text: string, onProgress?: ProgressHandler): Promise<string[]> {
  const modelId = await ensureEmbeddings(onProgress);

  const chunks = await ragChunk({
    documents: [`[${id}]\n${text}`],
    chunkOpts: {
      // El texto sale de OCR: los saltos de línea son de dónde el
      // reconocedor cortó las líneas de la foto, no de la estructura real
      // del documento, así que ni el chunkStrategy 'paragraph' (default)
      // evita que una cláusula quede partida justo en el borde de un chunk.
      // Un chunk más grande y con más solape que el default (256/50) baja
      // esa chance sin acercarse al límite de contexto del modelo de
      // embeddings.
      chunkSize: 400,
      chunkOverlap: 100,
      chunkStrategy: 'paragraph',
    },
  });
  if (chunks.length === 0) return [];

  const { embedding } = await embed({ modelId, text: chunks.map((c) => c.content) });

  const results = await ragSaveEmbeddings({
    workspace: RAG_WORKSPACE,
    documents: chunks.map((c, i) => ({
      id: c.id,
      content: c.content,
      embedding: embedding[i],
      embeddingModelId: EMBEDDING_MODEL_ID,
    })),
  });
  return results.filter((r): r is typeof r & { id: string } => r.status === 'fulfilled' && !!r.id).map((r) => r.id);
}

export async function searchExpediente(query: string, topK = 4): Promise<{ content: string; score: number }[]> {
  const modelId = await ensureEmbeddings();
  const results = await ragSearch({
    modelId,
    workspace: RAG_WORKSPACE,
    query,
    topK,
  });
  return results.map((r) => ({ content: r.content, score: r.score }));
}

/**
 * Borra del índice RAG los chunks de un documento ya ingestado.
 *
 * `ragDeleteEmbeddings` no necesita el modelo de embeddings cargado (borra
 * por id, no por contenido), así que esto no dispara una carga de modelo
 * innecesaria al eliminar un documento.
 */
export async function deleteExpedienteChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ragDeleteEmbeddings({ workspace: RAG_WORKSPACE, ids });
}

export async function ingestSeedDocs(onProgress?: ProgressHandler): Promise<void> {
  const docs = await listDocumentos();
  const pending = docs.filter((d) => d.ragStatus !== 'listo' && d.metadata);
  for (const d of pending) {
    try {
      const ids = await ingestExpedienteText(`${d.tipo}:${d.nombre}`, d.metadata as string, onProgress);
      await updateDocumentoRag(d.id, 'listo', undefined, ids);
    } catch {
      await updateDocumentoRag(d.id, 'error');
    }
  }
}
