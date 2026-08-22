import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { insertGasto, listGastos, listPartidas } from '../db/queries';
import { ocrImage, parseComprobante } from '../qvac/ocr';
import { colors, radius } from '../theme';
import type { Partida } from '../types';

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export function GastosScreen({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [gastos, setGastos] = useState<Awaited<ReturnType<typeof listGastos>>>([]);
  const [partidaId, setPartidaId] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ruta, setRuta] = useState<string | null>(null);
  const [ocrRaw, setOcrRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const p = await listPartidas();
    setPartidas(p);
    if (p[0] && partidaId == null) setPartidaId(p[0].id);
    setGastos(await listGastos());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function pickAndOcr() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const img = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (img.canceled || !img.assets[0]) {
      const gal = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (gal.canceled || !gal.assets[0]) return;
      await runOcr(gal.assets[0].uri);
      return;
    }
    if (!perm.granted) {
      setMsg('Sin cámara: se usó galería si elegiste foto.');
    }
    await runOcr(img.assets[0].uri);
  }

  async function runOcr(uri: string) {
    setBusy(true);
    setMsg('OCR del comprobante…');
    setRuta(uri);
    try {
      const text = await ocrImage(uri, (_, __, label) => setMsg(label));
      setOcrRaw(text);
      const parsed = parseComprobante(text);
      if (parsed.monto != null) setMonto(String(parsed.monto));
      if (parsed.descripcion) setDescripcion(parsed.descripcion);
      setMsg('Revisá monto y partida antes de guardar. El OCR no se persiste sin confirmar.');
    } catch (e) {
      setMsg(
        `OCR no corrió (${e instanceof Error ? e.message : String(e)}). Completá el gasto a mano y guardá.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!partidaId) {
      setMsg('Elegí una partida.');
      return;
    }
    const n = Number(monto.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      setMsg('Monto inválido.');
      return;
    }
    setBusy(true);
    try {
      await insertGasto({
        partidaId,
        monto: n,
        descripcion: descripcion.trim() || 'Gasto',
        rutaComprobante: ruta,
        fecha,
        ocrRaw,
      });
      setDescripcion('');
      setMonto('');
      setOcrRaw(null);
      setRuta(null);
      await reload();
      onChanged();
      setMsg('Gasto guardado.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Control de gastos" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Partida</Text>
        <ScrollView horizontal contentContainerStyle={styles.chips}>
          {partidas.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPartidaId(p.id)}
              style={[styles.chip, partidaId === p.id && styles.chipOn]}
            >
              <Text style={styles.chipText}>{p.clave}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>Monto</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} placeholder="0" placeholderTextColor={colors.muted} />
        <Text style={styles.label}>Descripción</Text>
        <TextInput style={styles.input} value={descripcion} onChangeText={setDescripcion} placeholder="Cemento, flete…" placeholderTextColor={colors.muted} />
        <Text style={styles.label}>Fecha</Text>
        <TextInput style={styles.input} value={fecha} onChangeText={setFecha} />
        <Pressable style={styles.secondary} onPress={pickAndOcr} disabled={busy}>
          <Text style={styles.secondaryText}>Foto de comprobante (OCR)</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={save} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirmar y guardar</Text>}
        </Pressable>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Text style={styles.section}>Cargados</Text>
        {gastos.map((g) => (
          <View key={g.id} style={styles.card}>
            <Text style={styles.gMonto}>{money(g.monto)}</Text>
            <Text style={styles.gDesc}>{g.descripcion}</Text>
            <Text style={styles.gMeta}>
              {g.partidaClave} · {g.fecha.slice(0, 10)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  body: { paddingBottom: 40 },
  label: { color: colors.muted, marginTop: 12, marginBottom: 6, fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { gap: 8 },
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
  primary: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryText: { color: colors.text, fontWeight: '700' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryText: { color: colors.text },
  msg: { color: colors.yellow, marginTop: 10, fontSize: 12 },
  section: { color: colors.text, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  gMonto: { color: colors.text, fontWeight: '700' },
  gDesc: { color: colors.text, marginTop: 4 },
  gMeta: { color: colors.muted, marginTop: 4, fontSize: 12 },
});
