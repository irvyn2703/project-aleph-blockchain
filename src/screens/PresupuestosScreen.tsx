import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenHeader } from '../components/ScreenHeader';
import { listPresupuesto, replacePresupuesto, setObraNombre, totalObra } from '../db/queries';
import { parsePresupuestoXlsx } from '../import/xlsx';
import { colors, layout, radius } from '../theme';
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
      const fileName = picked.assets[0].name?.replace(/\.(xlsx|xls)$/i, '').trim();
      if (fileName) await setObraNombre(fileName);
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
      <Text style={styles.hint}>
        Importá tu Excel. Columnas: clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu,
        importe. Reemplaza el presupuesto anterior (y borra gastos).
      </Text>
      <Pressable style={styles.importBtn} onPress={importXlsx} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.importText}>Importar Excel</Text>}
      </Pressable>
      <Text style={styles.total}>Total obra {money(total)}</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      {rows.length === 0 ? (
        <Text style={styles.empty}>No hay presupuesto. Elegí tu .xlsx.</Text>
      ) : null}
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
  root: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: layout.pagePadding,
    paddingTop: 18,
  },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -8, marginBottom: 14 },
  importBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importText: { color: colors.white, fontWeight: '700' },
  total: { color: colors.text, fontWeight: '700', marginTop: 20, marginBottom: 10, fontSize: 18 },
  msg: { color: colors.greenDark, backgroundColor: colors.greenSoft, borderRadius: radius.sm, padding: 10, fontSize: 12, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  list: { paddingBottom: 32, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  clave: { color: colors.greenDark, fontWeight: '700' },
  nombre: { color: colors.text, fontSize: 16, marginTop: 2 },
  importe: { color: colors.muted, marginTop: 4 },
  concepto: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cDesc: { color: colors.text, fontSize: 13 },
  cMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
