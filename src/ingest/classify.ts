/**
 * Clasificación de documentos por tipo de contenido.
 *
 * Vive aparte de `documents.ts` porque ese módulo importa `expo-file-system`,
 * que arrastra react-native y no resuelve fuera del runtime nativo. Acá no hay
 * dependencias, así que se testea en Node.
 */

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'bmp', 'webp']);
const TEXT_EXT = new Set(['txt', 'md']);

export type DocKind = 'texto' | 'imagen' | 'pdf' | 'desconocido';

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Decide cómo extraer el texto de un archivo.
 *
 * El nombre por sí solo no alcanza: lo que llega de Galería suele venir sin
 * extensión, y ahí una foto quedaría clasificada como desconocida y nunca
 * pasaría por OCR. El MIME type del picker es la señal confiable, así que
 * manda; la extensión queda como respaldo.
 */
export function classifyDoc(name: string, mimeType?: string): DocKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'imagen';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain' || mime === 'text/markdown') return 'texto';

  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return 'imagen';
  if (TEXT_EXT.has(ext)) return 'texto';
  if (ext === 'pdf') return 'pdf';
  return 'desconocido';
}
