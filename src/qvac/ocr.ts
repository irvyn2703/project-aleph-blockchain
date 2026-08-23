import { ocr, subscribeServerLogs } from '@qvac/sdk';
import { withOcr, type ProgressHandler } from './models';

/**
 * DIAGNÓSTICO TEMPORAL — quitar una vez resuelto qué backend usa el OCR.
 *
 * El addon reporta a qué device resolvió (`backendIsGpu`, y el motivo si cayó a
 * CPU), pero nada de eso llega al cliente: el plugin ggml-ocr arma las stats
 * campo por campo y solo conserva los tres tiempos, y el logger que le conecta
 * va con `enableConsole: false`, así que tampoco aparece en logcat. La única
 * vía sin parchear el SDK es suscribirse al stream de logs del server.
 */
const BACKEND_LOG = /backend|opencl|vulkan|adreno|gpu|fallback|cpu only/i;

export function logOcrBackend(): () => void {
  return subscribeServerLogs((log) => {
    if (BACKEND_LOG.test(log.message)) {
      console.log(`[ocr-backend] ${log.level} ${log.namespace}: ${log.message}`);
    }
  });
}

/**
 * El OCR corre en el worker Bare, que lee del filesystem con rutas nativas y
 * no entiende el esquema `file://` que devuelven las APIs de Expo. El propio
 * SDK hace este mismo destripado al pasarle HOME_DIR al worklet.
 */
export function toNativePath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

export async function ocrImage(path: string, onProgress?: ProgressHandler): Promise<string> {
  const nativePath = toNativePath(path);
  // Antes de withOcr: el backend se resuelve en el load() del modelo, así que
  // suscribirse después se pierde justo la línea que interesa.
  const unsubscribe = logOcrBackend();
  try {
    return await withOcr(async (modelId) => {
      const startedAt = Date.now();
      const { blocks, stats } = ocr({ modelId, image: nativePath });
      const result = await blocks;

      // Reparto detección/reconocimiento por etapa: es lo que dice si un cambio
      // de backend o de batch sirvió de algo.
      const s = await stats.catch(() => undefined);
      console.log(
        `[ocr] wall=${Date.now() - startedAt}ms total=${s?.totalTime ?? '?'}s ` +
          `deteccion=${s?.detectionTime ?? '?'}s reconocimiento=${s?.recognitionTime ?? '?'}s ` +
          `bloques=${result.length}`
      );

      const text = result
        .map((b) => b.text)
        .join('\n')
        .trim();

      // DIAGNÓSTICO TEMPORAL: cambiar de pipeline cambia el modelo, no solo la
      // velocidad. Sin ver el texto no se puede decir si DocTR salió más
      // rápido a costa de leer peor.
      console.log(`[ocr] chars=${text.length} texto=${JSON.stringify(text.slice(0, 400))}`);

      return text;
    }, onProgress);
  } finally {
    unsubscribe();
  }
}

export function parseComprobante(ocrText: string): { monto: number | null; descripcion: string } {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const money = ocrText.match(/(?:\$|ARS|total[:\s]*)\s*([\d.]+,\d{2}|\d+[\d.]*,\d{2}|\d+)/i);
  let monto: number | null = null;
  if (money?.[1]) {
    const n = Number(money[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) monto = n;
  } else {
    const candidates = [...ocrText.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)].map((m) =>
      Number(m[1].replace(/\./g, '').replace(',', '.'))
    );
    if (candidates.length) monto = Math.max(...candidates);
  }

  const descripcion = lines.slice(0, 3).join(' — ').slice(0, 180) || 'Gasto (OCR)';
  return { monto, descripcion };
}
