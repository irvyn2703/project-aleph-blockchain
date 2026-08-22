import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { getDb } from './src/db/client';
import { seedIfEmpty } from './src/db/seed';
import { ensureLlm } from './src/qvac/models';
import { ingestSeedDocs } from './src/qvac/rag';
import { ExpedienteScreen } from './src/screens/ExpedienteScreen';
import { GastosScreen } from './src/screens/GastosScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PresupuestosScreen } from './src/screens/PresupuestosScreen';
import { colors } from './src/theme';
import type { ScreenName } from './src/types';

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('home');
  const [qvacLabel, setQvacLabel] = useState('Inicializando datos…');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        await seedIfEmpty();
        if (cancelled) return;
        setQvacLabel('Datos locales listos. Cargando QVAC…');
        await ensureLlm((_, pct, label) => {
          if (!cancelled) setQvacLabel(pct != null ? `${label} ${pct}%` : label);
        }).catch((e) => {
          if (!cancelled) {
            setQvacLabel(
              `QVAC pendiente (${e instanceof Error ? e.message : String(e)}). El chat usa SQLite para totales/partidas.`
            );
          }
        });
        if (!cancelled) setQvacLabel((s) => (s.startsWith('QVAC pendiente') ? s : 'QVAC listo en dispositivo'));
        await ingestSeedDocs((_, pct, label) => {
          if (!cancelled) setQvacLabel(pct != null ? `${label} ${pct}%` : label);
        }).catch(() => undefined);
        if (!cancelled) {
          setQvacLabel((s) =>
            s.startsWith('QVAC pendiente') ? s : 'Listo · datos en el teléfono, nada sale a la nube'
          );
        }
      } catch (e) {
        if (!cancelled) setQvacLabel(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {screen === 'home' ? (
        <HomeScreen qvacLabel={qvacLabel} onOpen={setScreen} refreshToken={tick} />
      ) : null}
      {screen === 'presupuestos' ? (
        <PresupuestosScreen onBack={() => setScreen('home')} onChanged={() => setTick((n) => n + 1)} />
      ) : null}
      {screen === 'gastos' ? (
        <GastosScreen onBack={() => setScreen('home')} onChanged={() => setTick((n) => n + 1)} />
      ) : null}
      {screen === 'expediente' ? <ExpedienteScreen onBack={() => setScreen('home')} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? 28 : 0,
  },
});
