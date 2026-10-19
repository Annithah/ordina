import { StyleSheet, Text, View } from 'react-native';

import { OrdinaMark } from '@/components/ordina-mark';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';

type BrandLockupProps = {
  markSize?: number;
  wordmarkSize?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  onBlack?: boolean;
};

const NAME = { sm: 22, md: 32, lg: 40 };

export function BrandLockup({
  markSize = 120,
  wordmarkSize = 'md',
  showTagline = true,
  onBlack = false,
}: BrandLockupProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const fontSize = NAME[wordmarkSize];
  const ordi = onBlack ? '#FFFFFF' : theme.text;
  const tag = onBlack ? '#A1A1AA' : theme.textSecondary;

  return (
    <View style={styles.wrap} accessible accessibilityLabel={`ORDINA. ${t('brand.tagline')}`}>
      <OrdinaMark size={markSize} color={theme.primary} />
      <Text style={[styles.name, { fontSize, lineHeight: fontSize + 8, color: ordi }]}>
        ORDI
        <Text style={{ color: theme.primary }}>{'NA'}</Text>
      </Text>
      {showTagline ? <Text style={[styles.tagline, { color: tag }]}>{t('brand.tagline')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  name: {
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1.4,
    marginTop: 2,
  },
  tagline: {
    marginTop: 8,
    fontSize: 10,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    fontFamily: 'Poppins_400Regular',
  },
});
