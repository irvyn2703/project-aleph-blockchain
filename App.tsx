import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppHeader } from './src/components/AppHeader';
import { BottomNav } from './src/components/BottomNav';
import { getDb } from './src/db/client';
import { clearDemoDataOnce } from './src/db/seed';
import { useAppSafeArea } from './src/hooks/useAppSafeArea';
import { useKeyboardHeight } from './src/hooks/useKeyboardHeight';
import { ExpedienteScreen } from './src/screens/ExpedienteScreen';
import { GastosScreen } from './src/screens/GastosScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PresupuestosScreen } from './src/screens/PresupuestosScreen';
import { colors } from './src/theme';
import type { ScreenName } from './src/types';

export default function App() {
  const insets = useAppSafeArea();
  const keyboardHeight = useKeyboardHeight();
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
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar style="dark" backgroundColor={colors.bg} />
      <AppHeader />
      <View style={styles.content}>
        {screen === 'home' || screen === 'assistant' ? (
          <HomeScreen
            mode={screen}
            qvacLabel={qvacLabel}
            onOpen={setScreen}
            refreshToken={tick}
            keyboardHeight={keyboardHeight}
          />
        ) : null}
        {screen === 'presupuestos' ? (
          <PresupuestosScreen onBack={() => setScreen('home')} onChanged={() => setTick((n) => n + 1)} />
        ) : null}
        {screen === 'gastos' ? (
          <GastosScreen onBack={() => setScreen('home')} onChanged={() => setTick((n) => n + 1)} />
        ) : null}
        {screen === 'expediente' ? <ExpedienteScreen onBack={() => setScreen('home')} /> : null}
      </View>
      {keyboardHeight === 0 ? (
        <BottomNav active={screen} onOpen={setScreen} bottomInset={insets.bottom} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: { flex: 1, minHeight: 0 },
});
