import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { eliminarDocumento, ingestDocumento } from '../ingest/documents';
import { ocrImage } from '../qvac/ocr';
import { colors, layout, radius, spacing } from '../theme';
import type { Documento } from '../types';

type Origen = 'archivo' | 'camara' | 'galeria';

/**
 * Previsualiza un documento del expediente y permite reemplazarlo o
 * borrarlo. Es una pantalla propia de `ExpedienteScreen` (no pasa por
 * `App.tsx`/`ScreenName`): se abre y se cierra con estado local, siguiendo
 * el mismo patrón de "pantallas que se intercambian" del resto de la app,
 * pero anidado un nivel adentro.
 */
export function DocumentoPreviewScreen({
  doc,
  onBack,
  onChanged,
}: {
  doc: Documento;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function reemplazar(origen: Origen) {
    setBusy(true);
    setMsg(null);
    try {
      let uri: string | undefined;
      let name = doc.nombre;
      let mimeType: string | undefined;

      if (origen === 'camara' || origen === 'galeria') {
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

      // Ingesta el reemplazo primero: si falla, el documento original queda
      // intacto. Recién si eso sale bien se borra el viejo.
      await ingestDocumento({
        uri,
        name,
        tipo: doc.tipo,
        mimeType,
        ocrImage: async (path) => ocrImage(path, (_, __, label) => setMsg(label)),
      });
      await eliminarDocumento(doc);
      onChanged();
      onBack();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmarEliminar() {
    setBusy(true);
    try {
      await eliminarDocumento(doc);
      onChanged();
      onBack();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={doc.nombre} onBack={onBack} />
      <Text style={styles.meta}>
        {doc.tipo} · {doc.ragStatus} · {doc.fechaSubida.slice(0, 10)}
      </Text>

      <ScrollView contentContainerStyle={styles.previewBox}>
        {!previewFailed ? (
          <Image
            source={{ uri: doc.ruta }}
            style={styles.preview}
            resizeMode="contain"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <View style={styles.previewFallback}>
            <Text style={styles.previewFallbackIcon}>▤</Text>
            <Text style={styles.previewFallbackText}>
              {doc.metadata
                ? doc.metadata.slice(0, 500)
                : 'Sin previsualización disponible para este tipo de archivo.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <Text style={styles.hint}>Elegí cambio de documento</Text>
      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => reemplazar('archivo')} disabled={busy}>
          <Text style={styles.secondaryText}>Archivo</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => reemplazar('camara')} disabled={busy}>
          <Text style={styles.secondaryText}>Cámara</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => reemplazar('galeria')} disabled={busy}>
          <Text style={styles.secondaryText}>Galería</Text>
        </Pressable>
      </View>

      <Pressable style={styles.danger} onPress={() => setConfirmDelete(true)} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.dangerText}>Eliminar documento</Text>
        )}
      </Pressable>

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Eliminar &quot;{doc.nombre}&quot;?</Text>
            <Text style={styles.modalBody}>
              Se borra el archivo de este teléfono y ya no va a poder consultarse desde el asistente. No se
              puede deshacer.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setConfirmDelete(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={confirmarEliminar} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Eliminar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  meta: { color: colors.muted, fontSize: 13, marginTop: -10, marginBottom: 16, textTransform: 'capitalize' },
  previewBox: {
    minHeight: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: 320 },
  previewFallback: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: spacing.xl },
  previewFallbackIcon: { fontSize: 34, color: colors.muted, marginBottom: 10 },
  previewFallbackText: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  msg: { color: colors.greenDark, marginTop: 10, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 20, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text },
  danger: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  dangerText: { color: colors.white, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 32, 25, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  modalBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 22 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalConfirm: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: { color: colors.white, fontWeight: '700' },
});
