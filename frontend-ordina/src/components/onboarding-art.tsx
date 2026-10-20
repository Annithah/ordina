import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import { OrdinaMark } from '@/components/ordina-mark';
import { useAppTheme } from '@/providers/theme-provider';

export function OnboardingArt() {
  const { scheme, colors } = useAppTheme();
  const ring = scheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)';

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 390 280">
        <Circle cx="310" cy="78" r="168" stroke={ring} strokeWidth="1" fill="none" strokeDasharray="5 7" />
        <Circle cx="310" cy="78" r="118" stroke={ring} strokeWidth="1" fill="none" strokeDasharray="4 8" />
        <Circle cx="310" cy="78" r="72" stroke={ring} strokeWidth="1" fill="none" />
        <Circle cx="210" cy="150" r="90" stroke={ring} strokeWidth="1" fill="none" strokeDasharray="3 9" />
      </Svg>
      <View style={styles.mark}>
        <OrdinaMark size={148} color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 250,
    width: '100%',
  },
  mark: {
    position: 'absolute',
    right: 8,
    top: 12,
  },
});
