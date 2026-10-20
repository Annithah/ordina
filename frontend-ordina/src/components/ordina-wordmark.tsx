import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type OrdinaWordmarkProps = {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const NAME = {
  sm: 22,
  md: 32,
  lg: 42,
};

export function OrdinaWordmark({ showTagline = true, size = 'md' }: OrdinaWordmarkProps) {
  const theme = useTheme();
  const fontSize = NAME[size];

  return (
    <View style={styles.wrap}>
      <ThemedText style={[styles.name, { fontSize, lineHeight: fontSize + 6, color: theme.text }]}>
        ORDI
        <ThemedText style={[styles.name, { fontSize, lineHeight: fontSize + 6, color: theme.primary }]}>
          NA
        </ThemedText>
      </ThemedText>
      {showTagline ? (
        <ThemedText themeColor="textSecondary" style={styles.tagline}>
          {Brand.tagline}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  name: {
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1.2,
  },
  tagline: {
    marginTop: 6,
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    fontFamily: 'Poppins_400Regular',
  },
});
