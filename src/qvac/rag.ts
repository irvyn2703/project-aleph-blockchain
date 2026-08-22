import { ragIngest, ragSearch } from '@qvac/sdk';
import { CONTRATO_DEMO, MEMORIA_DEMO } from '../db/seed';
import { listDocumentos, updateDocumentoRag } from '../db/queries';
import { ensureEmbeddings, type ProgressHandler } from './models';

export const RAG_WORKSPACE = 'obra-expediente';

export async function ingestExpedienteText(id: string, text: string, onProgress?: ProgressHandler): Promise<void> {
  const modelId = await ensureEmbeddings(onProgress);
  await ragIngest({
    modelId,
    workspace: RAG_WORKSPACE,
    documents: [`[${id}]\n${text}`],
    chunk: true,
  });
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

export async function ingestSeedDocs(onProgress?: ProgressHandler): Promise<void> {
  const docs = await listDocumentos();
  const pending = docs.filter((d) => d.ragStatus !== 'listo' && d.metadata);
  if (pending.length === 0 && docs.length === 0) {
    await ingestExpedienteText('legal:contrato-demo', CONTRATO_DEMO, onProgress);
    await ingestExpedienteText('memoria:memoria-demo', MEMORIA_DEMO, onProgress);
    return;
  }
  for (const d of pending) {
    try {
      await ingestExpedienteText(`${d.tipo}:${d.nombre}`, d.metadata as string, onProgress);
      await updateDocumentoRag(d.id, 'listo');
    } catch {
      await updateDocumentoRag(d.id, 'error');
    }
  }
}
