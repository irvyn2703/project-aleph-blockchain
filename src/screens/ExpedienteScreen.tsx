import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { listDocumentos } from '../db/queries';
import { ingestDocumento } from '../ingest/documents';
import { ocrImage } from '../qvac/ocr';
import { DocumentoPreviewScreen } from './DocumentoPreviewScreen';
import { colors, layout, radius } from '../theme';
import type { Documento, DocumentoTipo } from '../types';

type Origen = 'archivo' | 'camara' | 'galeria';

export function ExpedienteScreen({ onBack }: { onBack: () => void }) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [tipo, setTipo] = useState<DocumentoTipo>('legal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Documento | null>(null);

  async function reload() {
    setDocs(await listDocumentos());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addFile(origen: Origen) {
    setBusy(true);
    setMsg(null);
    try {
      let uri: string | undefined;
      let name = 'documento';
      let mimeType: string | undefined;

      if (origen === 'camara' || origen === 'galeria') {
        // Las fotos se eligen con expo-image-picker, no con el picker de
        // documentos: en Android ese abre la vista de Documentos, que no
        // lista la galería.
        const img =
          origen === 'camara'
            ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (img.canceled || !img.assets[0]) {
          setBusy(false);
          return;
        }
        const asset = img.assets[0];
        uri = asset.uri;
        name = asset.fileName ?? `foto-${Date.now()}.jpg`;
        mimeType = asset.mimeType ?? 'image/jpeg';
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (picked.canceled || !picked.assets[0]) {
          setBusy(false);
          return;
        }
        uri = picked.assets[0].uri;
        name = picked.assets[0].name;
        mimeType = picked.assets[0].mimeType;
      }
      const result = await ingestDocumento({
        uri,
        name,
        tipo,
        mimeType,
        ocrImage: async (path) => ocrImage(path, (_, __, label) => setMsg(label)),
      });
      await reload();
      setMsg(
        result.extracted
          ? `Ingestado (${result.extracted.length} chars). ${result.warnings.join(' ')}`
          : result.warnings.join(' ') || 'Guardado sin texto extraíble.'
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (previewDoc) {
    return (
      <DocumentoPreviewScreen
        doc={previewDoc}
        onBack={() => setPreviewDoc(null)}
        onChanged={() => void reload()}
      />
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Expediente" onBack={onBack} />
      <Text style={styles.subtitle}>{docs.length} archivos · cifrado en este teléfono</Text>
      <View style={styles.search}>
        <Text style={styles.searchText}>⌕  Buscar documento, proveedor o partida…</Text>
      </View>
      <Text style={styles.hint}>Elegí el tipo de documento antes de incorporarlo.</Text>
      <View style={styles.chips}>
        {(['legal', 'memoria', 'plano'] as DocumentoTipo[]).map((t) => (
          <Pressable key={t} onPress={() => setTipo(t)} style={[styles.chip, tipo === t && styles.chipOn]}>
            <Text style={styles.chipText}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => addFile('archivo')} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Archivo</Text>}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => addFile('camara')} disabled={busy}>
          <Text style={styles.secondaryText}>Cámara</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => addFile('galeria')} disabled={busy}>
          <Text style={styles.secondaryText}>Galería</Text>
        </Pressable>
      </View>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {docs.map((d) => (
          <Pressable key={d.id} style={styles.card} onPress={() => setPreviewDoc(d)}>
            <View style={styles.docIcon}><Text style={styles.docIconText}>▤</Text></View>
            <View style={styles.docCopy}>
              <Text style={styles.nombre}>{d.nombre}</Text>
              <Text style={styles.meta}>
                {d.tipo} · {d.ragStatus} · {d.fechaSubida.slice(0, 10)}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: layout.pagePadding,
    paddingTop: 18,
  },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: -10, marginBottom: 20 },
  search: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 18 },
  searchText: { color: colors.muted, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  chipText: { color: colors.text, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '700' },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text },
  msg: { color: colors.greenDark, marginTop: 10, fontSize: 12 },
  list: { paddingTop: 18, paddingBottom: 32 },
  card: {
    minHeight: 76,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  docIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  docIconText: { color: colors.text, fontSize: 18 },
  docCopy: { flex: 1 },
  nombre: { color: colors.text, fontWeight: '600', fontSize: 15 },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12 },
  arrow: { color: colors.muted, fontSize: 21 },
});
