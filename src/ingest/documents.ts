import * as FileSystem from 'expo-file-system/legacy';
import { insertDocumento, updateDocumentoRag } from '../db/queries';
import { ingestExpedienteText } from '../qvac/rag';
import type { DocumentoTipo } from '../types';
import { classifyDoc, extOf } from './classify';

export { classifyDoc, extOf, type DocKind } from './classify';

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
  mimeType?: string;
  ocrImage?: (path: string) => Promise<string>;
}): Promise<{ id: number; extracted: string; warnings: string[] }> {
  const warnings: string[] = [];
  const dest = await copyIntoDocs(params.uri, params.name);
  const kind = params.uri.startsWith('seed://') ? 'texto' : classifyDoc(params.name, params.mimeType);
  let extracted = '';

  if (kind === 'texto') {
    extracted = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.UTF8 });
  } else if (kind === 'imagen') {
    if (!params.ocrImage) {
      warnings.push('Imagen guardada. OCR no disponible todavía (cargá el modelo en un dispositivo físico).');
    } else {
      extracted = await params.ocrImage(dest);
    }
  } else if (kind === 'pdf') {
    warnings.push('PDF nativo guardado. Para el MVP, pegá texto o una foto de las páginas si el PDF es escaneado.');
    try {
      const maybe = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.UTF8 });
      if (maybe && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{20,}/.test(maybe)) extracted = maybe;
    } catch {
      // binary pdf
    }
  } else {
    const ext = extOf(params.name);
    warnings.push(
      ext ? `Extensión .${ext} no extrae texto. Se guarda el archivo.` : 'Formato no reconocido. Se guarda el archivo.'
    );
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
