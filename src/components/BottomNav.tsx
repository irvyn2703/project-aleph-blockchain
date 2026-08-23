import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout } from '../theme';
import type { ScreenName } from '../types';

const items: { screen: ScreenName; label: string; icon: string }[] = [
  { screen: 'home', label: 'Inicio', icon: '⌂' },
  { screen: 'expediente', label: 'Expediente', icon: '▤' },
  { screen: 'gastos', label: 'Capturar', icon: '▣' },
  { screen: 'assistant', label: 'Asistente', icon: '✦' },
];

export function BottomNav({
  active,
  onOpen,
  bottomInset,
}: {
  active: ScreenName;
  onOpen: (screen: ScreenName) => void;
  bottomInset: number;
}) {
  const selected = active === 'presupuestos' ? 'home' : active;

  return (
    <View style={[styles.border, { paddingBottom: bottomInset }]}>
      <View style={styles.row}>
        {items.map((item) => {
          const isActive = selected === item.screen;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={item.screen}
              onPress={() => onOpen(item.screen)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Text style={[styles.icon, isActive && styles.active]}>{item.icon}</Text>
              <Text style={[styles.label, isActive && styles.activeLabel]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  border: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: {
    width: '100%',
    maxWidth: layout.maxWidth,
    minHeight: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  item: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pressed: { opacity: 0.55 },
  icon: { color: colors.muted, fontSize: 21, lineHeight: 24 },
  label: { color: colors.muted, fontSize: 11 },
  active: { color: colors.greenDark },
  activeLabel: { color: colors.greenDark, fontWeight: '700' },
});
