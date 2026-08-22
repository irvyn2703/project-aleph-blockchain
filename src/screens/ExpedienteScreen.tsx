import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { listDocumentos } from '../db/queries';
import { ingestDocumento } from '../ingest/documents';
import { ocrImage } from '../qvac/ocr';
import { colors, radius } from '../theme';
import type { Documento, DocumentoTipo } from '../types';

export function ExpedienteScreen({ onBack }: { onBack: () => void }) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [tipo, setTipo] = useState<DocumentoTipo>('legal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    setDocs(await listDocumentos());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addFile(fromCamera: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      let uri: string | undefined;
      let name = 'documento';
      if (fromCamera) {
        const img = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (img.canceled || !img.assets[0]) {
          setBusy(false);
          return;
        }
        uri = img.assets[0].uri;
        name = `foto-${Date.now()}.jpg`;
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (picked.canceled || !picked.assets[0]) {
          setBusy(false);
          return;
        }
        uri = picked.assets[0].uri;
        name = picked.assets[0].name;
      }
      const result = await ingestDocumento({
        uri,
        name,
        tipo,
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

  return (
    <View style={styles.root}>
      <ScreenHeader title="Expediente" onBack={onBack} />
      <Text style={styles.hint}>Demo: legales y memoria de cálculo. Planos se pueden guardar pero no son fuente de cantidades.</Text>
      <View style={styles.chips}>
        {(['legal', 'memoria', 'plano'] as DocumentoTipo[]).map((t) => (
          <Pressable key={t} onPress={() => setTipo(t)} style={[styles.chip, tipo === t && styles.chipOn]}>
            <Text style={styles.chipText}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => addFile(false)} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Archivo</Text>}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => addFile(true)} disabled={busy}>
          <Text style={styles.secondaryText}>Foto</Text>
        </Pressable>
      </View>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {docs.map((d) => (
          <View key={d.id} style={styles.card}>
            <Text style={styles.nombre}>{d.nombre}</Text>
            <Text style={styles.meta}>
              {d.tipo} · {d.ragStatus} · {d.fechaSubida.slice(0, 10)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.greenDark, borderColor: colors.green },
  chipText: { color: colors.text, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: colors.text, fontWeight: '700' },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text },
  msg: { color: colors.yellow, marginTop: 10, fontSize: 12 },
  list: { paddingTop: 16, paddingBottom: 40, gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  nombre: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12 },
});
