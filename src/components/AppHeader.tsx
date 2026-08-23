import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, layout } from '../theme';

export function AppHeader() {
  return (
    <View style={styles.border}>
      <View style={styles.row}>
        <View style={styles.markWrap}>
          <Image source={require('../../assets/logo.png')} style={styles.mark} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.name}>planner</Text>
          <Text style={styles.subtitle}>Expediente local de obra</Text>
        </View>
        <View style={styles.localIcon}>
          <View style={styles.localDot} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  row: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    minHeight: 98,
    paddingHorizontal: layout.pagePadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  markWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F8F0E4',
  },
  mark: { width: 52, height: 52 },
  copy: { flex: 1, marginLeft: 14 },
  name: { color: colors.text, fontSize: 21, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3, letterSpacing: 0.1 },
  localIcon: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.greenDark },
});
