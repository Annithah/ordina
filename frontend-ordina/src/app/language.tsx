import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageList } from '@/components/language-picker';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';

export default function LanguageScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <LanguageList />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  scroll: { paddingBottom: 32 },
});
