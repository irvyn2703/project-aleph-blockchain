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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: colors.text, fontSize: 22, lineHeight: 24 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
});
