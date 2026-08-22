import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { listPresupuesto, replacePresupuesto, totalObra } from '../db/queries';
import { parsePresupuestoXlsx } from '../import/xlsx';
import { colors, radius } from '../theme';
import type { PartidaConConceptos } from '../types';

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export function PresupuestosScreen({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<PartidaConConceptos[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    setRows(await listPresupuesto());
  }

  useEffect(() => {
    void reload();
  }, []);

  const total = useMemo(() => rows.reduce((a, p) => a + p.importe, 0), [rows]);

  async function importXlsx() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        '*/*',
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    setMsg(null);
    try {
      const parsed = await parsePresupuestoXlsx(picked.assets[0].uri);
      await replacePresupuesto(parsed.partidas);
      await reload();
      onChanged();
      const t = await totalObra();
      const warn = parsed.warnings.slice(0, 3).join('\n');
      setMsg(`Importadas ${parsed.partidas.length} partidas. Total ${money(t)}.${warn ? `\n${warn}` : ''}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Presupuestos" onBack={onBack} />
      <Text style={styles.hint}>Import-only. Columnas: clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe.</Text>
      <Pressable style={styles.importBtn} onPress={importXlsx} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.importText}>Importar Excel</Text>}
      </Pressable>
      <Text style={styles.total}>Total obra {money(total)}</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((p) => (
          <View key={p.id} style={styles.card}>
            <Pressable onPress={() => setOpen(open === p.id ? null : p.id)}>
              <Text style={styles.clave}>{p.clave}</Text>
              <Text style={styles.nombre}>{p.nombre}</Text>
              <Text style={styles.importe}>{money(p.importe)}</Text>
            </Pressable>
            {open === p.id
              ? p.conceptos.map((c) => (
                  <View key={c.id} style={styles.concepto}>
                    <Text style={styles.cDesc}>
                      {c.clave} · {c.descripcion}
                    </Text>
                    <Text style={styles.cMeta}>
                      {c.cantidad} {c.um} × {money(c.pu)} = {money(c.importe)}
                    </Text>
                  </View>
                ))
              : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  importBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importText: { color: colors.text, fontWeight: '700' },
  total: { color: colors.text, fontWeight: '700', marginTop: 14, marginBottom: 8, fontSize: 16 },
  msg: { color: colors.yellow, fontSize: 12, marginBottom: 8 },
  list: { paddingBottom: 32, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  clave: { color: colors.green, fontWeight: '700' },
  nombre: { color: colors.text, fontSize: 16, marginTop: 2 },
  importe: { color: colors.muted, marginTop: 4 },
  concepto: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cDesc: { color: colors.text, fontSize: 13 },
  cMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
