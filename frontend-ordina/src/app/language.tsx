import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { LANGUAGES } from '@/i18n';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function LanguageScreen() {
  const theme = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>{t('language.title')}</ThemedText>
      </View>
      <ThemedText themeColor="textSecondary" style={styles.sub}>
        {t('language.subtitle')}
      </ThemedText>
      <ScrollView contentContainerStyle={styles.list}>
        {LANGUAGES.map((item) => {
          const active = locale === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setLocale(item.id)}
              style={[
                styles.row,
                {
                  backgroundColor: theme.card,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}>
              <ThemedText style={styles.native}>{item.native}</ThemedText>
              {active ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  list: { gap: 10, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 56,
  },
  native: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
});
