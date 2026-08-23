import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { getDb } from './src/db/client';
import { clearDemoDataOnce } from './src/db/seed';
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
        await clearDemoDataOnce();
        if (cancelled) return;
        setQvacLabel('Vacío · importá tu presupuesto y tus gastos.');
      } catch (e) {
        if (!cancelled) setQvacLabel(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.safe}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? 28 : 0,
  },
});
