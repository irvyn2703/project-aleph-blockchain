import * as FileSystem from 'expo-file-system/legacy';
import { insertDocumento, updateDocumentoRag } from '../db/queries';
import { ingestExpedienteText } from '../qvac/rag';
import type { DocumentoTipo } from '../types';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'bmp', 'webp']);
const TEXT_EXT = new Set(['txt', 'md']);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export async function copyIntoDocs(uri: string, name: string): Promise<string> {
  const dir = FileSystem.documentDirectory + 'expediente/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = dir + `${Date.now()}-${name.replace(/[^\w.\-]+/g, '_')}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function ingestDocumento(params: {
  uri: string;
  name: string;
  tipo: DocumentoTipo;
  ocrImage?: (path: string) => Promise<string>;
}): Promise<{ id: number; extracted: string; warnings: string[] }> {
  const warnings: string[] = [];
  const dest = await copyIntoDocs(params.uri, params.name);
  const ext = extOf(params.name);
  let extracted = '';

  if (TEXT_EXT.has(ext) || params.uri.startsWith('seed://')) {
    extracted = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.UTF8 });
  } else if (IMAGE_EXT.has(ext)) {
    if (!params.ocrImage) {
      warnings.push('Imagen guardada. OCR no disponible todavía (cargá el modelo en un dispositivo físico).');
    } else {
      extracted = await params.ocrImage(dest);
    }
  } else if (ext === 'pdf') {
    warnings.push('PDF nativo guardado. Para el MVP, pegá texto o una foto de las páginas si el PDF es escaneado.');
    try {
      const maybe = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.UTF8 });
      if (maybe && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{20,}/.test(maybe)) extracted = maybe;
    } catch {
      // binary pdf
    }
  } else {
    warnings.push(`Extensión .${ext} no extrae texto. Se guarda el archivo.`);
  }

  const id = await insertDocumento({
    ruta: dest,
    tipo: params.tipo,
    nombre: params.name,
    metadata: extracted || null,
    ragStatus: extracted ? 'pendiente' : 'error',
  });

  if (extracted) {
    try {
      await ingestExpedienteText(`${params.tipo}:${params.name}`, extracted);
      await updateDocumentoRag(id, 'listo', extracted);
    } catch (e) {
      warnings.push(`RAG: ${e instanceof Error ? e.message : String(e)}`);
      await updateDocumentoRag(id, 'error', extracted);
    }
  }

  return { id, extracted, warnings };
}
