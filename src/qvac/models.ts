import { getQvac } from './sdk';

export type ModelKind = 'llm' | 'embeddings' | 'ocr';

type Loaded = {
  llm: string | null;
  embeddings: string | null;
  ocr: string | null;
};

const loaded: Loaded = { llm: null, embeddings: null, ocr: null };

export type ProgressHandler = (kind: ModelKind, pct: number | null, label: string) => void;

export async function ensureLlm(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.llm) return loaded.llm;
  const sdk = await getQvac();
  onProgress?.('llm', 0, 'Descargando LLM');
  await sdk.downloadAsset({
    assetSrc: sdk.LLAMA_3_2_1B_INST_Q4_0,
    onProgress: (p) => onProgress?.('llm', Math.round(p.percentage), 'Descargando llm'),
  });
  onProgress?.('llm', null, 'Cargando LLM en memoria');
  loaded.llm = await sdk.loadModel({
    modelSrc: sdk.LLAMA_3_2_1B_INST_Q4_0,
    modelType: 'llm',
    modelConfig: {
      device: 'gpu',
      ctx_size: 2048,
      tools: true,
      verbosity: sdk.VERBOSITY.ERROR,
    },
    onProgress: (p) => onProgress?.('llm', Math.round(p.percentage), 'Cargando LLM'),
  });
  onProgress?.('llm', 100, 'LLM listo');
  return loaded.llm;
}

export async function ensureEmbeddings(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.embeddings) return loaded.embeddings;
  const sdk = await getQvac();
  onProgress?.('embeddings', 0, 'Descargando embeddings');
  await sdk.downloadAsset({
    assetSrc: sdk.GTE_LARGE_FP16,
    onProgress: (p) => onProgress?.('embeddings', Math.round(p.percentage), 'Descargando embeddings'),
  });
  loaded.embeddings = await sdk.loadModel({
    modelSrc: sdk.GTE_LARGE_FP16,
    onProgress: (p) => onProgress?.('embeddings', Math.round(p.percentage), 'Cargando embeddings'),
  });
  onProgress?.('embeddings', 100, 'Embeddings listos');
  return loaded.embeddings;
}

export async function withOcr<T>(fn: (modelId: string) => Promise<T>, onProgress?: ProgressHandler): Promise<T> {
  const sdk = await getQvac();
  onProgress?.('ocr', 0, 'Cargando OCR');
  await sdk.downloadAsset({
    assetSrc: sdk.OCR_LATIN,
    onProgress: (p) => onProgress?.('ocr', Math.round(p.percentage), 'Descargando ocr'),
  });
  const modelId = await sdk.loadModel({
    modelSrc: sdk.OCR_LATIN,
    onProgress: (p) => onProgress?.('ocr', Math.round(p.percentage), 'Cargando OCR'),
  });
  loaded.ocr = modelId;
  try {
    return await fn(modelId);
  } finally {
    await sdk.unloadModel({ modelId, clearStorage: false }).catch(() => undefined);
    loaded.ocr = null;
  }
}

export function getLoaded() {
  return { ...loaded };
}
