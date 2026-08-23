import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function ScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16 },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: colors.text, fontSize: 25, lineHeight: 27, marginTop: -2 },
  title: { color: colors.text, fontSize: 29, letterSpacing: -0.8, fontWeight: '700', flex: 1 },
});
