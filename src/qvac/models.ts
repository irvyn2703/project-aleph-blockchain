import {
  downloadAsset,
  loadModel,
  unloadModel,
  GTE_LARGE_FP16,
  LLAMA_3_2_1B_INST_Q4_0,
  OCR_DOCTR,
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
    assetSrc: OCR_DOCTR,
    onProgress: (p: ModelProgressUpdate) => onProgress?.('ocr', Math.round(p.percentage), 'Descargando ocr'),
  });
  const modelId = await loadModel({
    // Pipeline DocTR (DBNet + CRNN MobileNetV3) en vez de EasyOCR (CRAFT).
    // En este device todo corre en CPU —no hay ruta GPU: Vulkan auto-excluye
    // las Adreno por cómputo incorrecto y OpenCL no registra device en un
    // 642L—, y ahí CRAFT es el cuello: 18,8 s de los 29,6 s totales. DBNet es
    // MobileNetV3, convolución depthwise-separable, mucho más barata en CPU,
    // y el detector baja de 83 MB a 8 MB, lo que además alivia la presión de
    // memoria que dispara el lowmemorykiller.
    // El SDK deriva solo el detector y el pipelineType a partir de OCR_DOCTR.
    modelSrc: OCR_DOCTR,
    modelConfig: {
      // El addon ggml-ocr solo admite 'en' (SUPPORTED_LANGUAGES en
      // @qvac/ocr-ggml). No limita el español: reconoce todo el alfabeto
      // latino —acentos y ñ incluidos—, y langList elige el juego de
      // caracteres del reconocedor, no el idioma del texto.
      langList: ['en'],
      // CPU explícito: ya está medido que no hay GPU utilizable acá y pedir
      // un backend inexistente solo agrega un fallback silencioso.
      backendDevice: 'cpu',
      // Ojo: canvasSize, magRatio, recognizerBatchSize y contrastRetry son
      // knobs de EasyOCR y el addon los ignora en DocTR, así que no se pasan
      // (ver OcrGgmlParams: los cuatro están marcados "easyocr only"). El
      // techo de memoria que resolvía canvasSize lo da acá el propio DBNet,
      // que escala la imagen a una resolución fija y acotada.
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
