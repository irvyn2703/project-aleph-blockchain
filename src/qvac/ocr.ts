import { getQvac } from './sdk';
import { withOcr, type ProgressHandler } from './models';

export async function ocrImage(path: string, onProgress?: ProgressHandler): Promise<string> {
  const sdk = await getQvac();
  return withOcr(async (modelId) => {
    const { blocks } = sdk.ocr({ modelId, image: path });
    const result = await blocks;
    return result
      .map((b) => b.text)
      .join('\n')
      .trim();
  }, onProgress);
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
