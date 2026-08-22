import {
  downloadAsset,
  GTE_LARGE_FP16,
  LLAMA_3_2_1B_INST_Q4_0,
  loadModel,
  OCR_LATIN,
  unloadModel,
  VERBOSITY,
  type ModelProgressUpdate,
} from '@qvac/sdk';

export type ModelKind = 'llm' | 'embeddings' | 'ocr';

type Loaded = {
  llm: string | null;
  embeddings: string | null;
  ocr: string | null;
};

const loaded: Loaded = { llm: null, embeddings: null, ocr: null };

export type ProgressHandler = (kind: ModelKind, pct: number | null, label: string) => void;

async function download(
  src: typeof LLAMA_3_2_1B_INST_Q4_0 | typeof GTE_LARGE_FP16 | typeof OCR_LATIN,
  kind: ModelKind,
  onProgress?: ProgressHandler
) {
  await downloadAsset({
    assetSrc: src,
    onProgress: (p: ModelProgressUpdate) => {
      onProgress?.(kind, Math.round(p.percentage), `Descargando ${kind}`);
    },
  });
}

export async function ensureLlm(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.llm) return loaded.llm;
  onProgress?.('llm', 0, 'Descargando LLM');
  await download(LLAMA_3_2_1B_INST_Q4_0, 'llm', onProgress);
  onProgress?.('llm', null, 'Cargando LLM en memoria');
  loaded.llm = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelType: 'llm',
    modelConfig: {
      device: 'gpu',
      ctx_size: 2048,
      tools: true,
      verbosity: VERBOSITY.ERROR,
    },
    onProgress: (p: ModelProgressUpdate) => onProgress?.('llm', Math.round(p.percentage), 'Cargando LLM'),
  });
  onProgress?.('llm', 100, 'LLM listo');
  return loaded.llm;
}

export async function ensureEmbeddings(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.embeddings) return loaded.embeddings;
  onProgress?.('embeddings', 0, 'Descargando embeddings');
  await download(GTE_LARGE_FP16, 'embeddings', onProgress);
  loaded.embeddings = await loadModel({
    modelSrc: GTE_LARGE_FP16,
    onProgress: (p: ModelProgressUpdate) =>
      onProgress?.('embeddings', Math.round(p.percentage), 'Cargando embeddings'),
  });
  onProgress?.('embeddings', 100, 'Embeddings listos');
  return loaded.embeddings;
}

export async function withOcr<T>(fn: (modelId: string) => Promise<T>, onProgress?: ProgressHandler): Promise<T> {
  onProgress?.('ocr', 0, 'Cargando OCR');
  await download(OCR_LATIN, 'ocr', onProgress);
  const modelId = await loadModel({
    modelSrc: OCR_LATIN,
    onProgress: (p: ModelProgressUpdate) => onProgress?.('ocr', Math.round(p.percentage), 'Cargando OCR'),
  });
  loaded.ocr = modelId;
  try {
    return await fn(modelId);
  } finally {
    await unloadModel({ modelId, clearStorage: false }).catch(() => undefined);
    loaded.ocr = null;
  }
}

export function getLoaded() {
  return { ...loaded };
}
