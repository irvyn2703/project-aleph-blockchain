import {
  downloadAsset,
  loadModel,
  unloadModel,
  GTE_LARGE_FP16,
  LLAMA_3_2_1B_INST_Q4_0,
  OCR_LATIN,
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

export async function ensureLlm(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.llm) return loaded.llm;
  onProgress?.('llm', 0, 'Descargando LLM');
  await downloadAsset({
    assetSrc: LLAMA_3_2_1B_INST_Q4_0,
    onProgress: (p: ModelProgressUpdate) => onProgress?.('llm', Math.round(p.percentage), 'Descargando llm'),
  });
  onProgress?.('llm', null, 'Cargando LLM en memoria');
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelConfig: {
      // CPU y sin capas en GPU. El default (device 'gpu', gpu_layers 99)
      // sube el modelo entero a la GPU: con el OCR —modelos de 95 MB— esa
      // ruta pedía 4,8 GB de golpe y el sistema mataba el proceso. Este
      // modelo son 773 MB, así que el riesgo es mayor, no menor.
      device: 'cpu',
      gpu_layers: 0,
      ctx_size: 2048,
      tools: true,
      // Sin mmap el modelo se copia entero a RAM al cargar; con mmap el
      // kernel pagina bajo demanda y el pico baja mucho.
      no_mmap: false,
      verbosity: VERBOSITY.ERROR,
    },
    onProgress: (p: ModelProgressUpdate) => onProgress?.('llm', Math.round(p.percentage), 'Cargando LLM'),
  });
  loaded.llm = modelId;
  onProgress?.('llm', 100, 'LLM listo');
  return modelId;
}

export async function ensureEmbeddings(onProgress?: ProgressHandler): Promise<string> {
  if (loaded.embeddings) return loaded.embeddings;
  onProgress?.('embeddings', 0, 'Descargando embeddings');
  await downloadAsset({
    assetSrc: GTE_LARGE_FP16,
    onProgress: (p: ModelProgressUpdate) =>
      onProgress?.('embeddings', Math.round(p.percentage), 'Descargando embeddings'),
  });
  const modelId = await loadModel({
    modelSrc: GTE_LARGE_FP16,
    // Mismo criterio que el LLM: el default sube el modelo a la GPU y en
    // este device esa ruta agota la memoria. Son 670 MB.
    // Ojo: este plugin usa `gpuLayers` en camelCase, no `gpu_layers`.
    modelConfig: { device: 'cpu', gpuLayers: 0 },
    onProgress: (p: ModelProgressUpdate) =>
      onProgress?.('embeddings', Math.round(p.percentage), 'Cargando embeddings'),
  });
  loaded.embeddings = modelId;
  onProgress?.('embeddings', 100, 'Embeddings listos');
  return modelId;
}

export async function withOcr<T>(
  fn: (modelId: string) => Promise<T>,
  onProgress?: ProgressHandler
): Promise<T> {
  onProgress?.('ocr', 0, 'Cargando OCR');
  await downloadAsset({
    assetSrc: OCR_LATIN,
    onProgress: (p: ModelProgressUpdate) => onProgress?.('ocr', Math.round(p.percentage), 'Descargando ocr'),
  });
  const modelId = await loadModel({
    modelSrc: OCR_LATIN,
    modelConfig: {
      // El addon ggml-ocr solo admite 'en' (SUPPORTED_LANGUAGES en
      // @qvac/ocr-ggml). No limita el español: OCR_LATIN reconoce todo el
      // alfabeto latino —acentos y ñ incluidos—, y langList elige el juego
      // de caracteres del reconocedor, no el idioma del texto.
      langList: ['en'],
      // CPU a propósito. El backend Vulkan reserva memoria de golpe al
      // inicializar el driver Adreno y en gama media dispara el
      // lowmemorykiller, que se lleva puesto el proceso. El reconocedor son
      // 15 MB: en CPU anda de sobra y no arriesga la app.
      backendDevice: 'cpu',
      // Techo del escalado del detector. Sin esto, una foto de cámara
      // (12 MPx) se amplía hasta pedir ~4,8 GB de una sola vez: medido en
      // device, el proceso muere y arrastra a los servicios del sistema.
      // 1280 px alcanza de sobra para leer un comprobante.
      canvasSize: 1280,
      magRatio: 1,
      // Una línea de texto por lote: el reconocedor procesa recortes
      // pequeños y agruparlos multiplica el pico de memoria sin ganar mucho.
      recognizerBatchSize: 1,
    },
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
