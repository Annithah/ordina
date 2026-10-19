/**
 * Intro: four short screens, one idea each. Skip on every screen, progress dots, "Get started"
 * on the last one, and the language button on the first. Shown once on first launch; it can be
 * replayed from Settings → View intro (then it simply closes at the end).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type IconName } from '@/components/chip';
import { OrdinaMark } from '@/components/ordina-mark';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/i18n';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';

const SLIDES: { key: string; icon: IconName | null; color: string }[] = [
  { key: 's1', icon: null, color: '#5C4DF2' },
  { key: 's2', icon: 'list-outline', color: '#3B82F6' },
  { key: 's3', icon: 'sparkles-outline', color: '#7C3AED' },
  { key: 's4', icon: 'notifications-outline', color: '#22C55E' },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { width } = useWindowDimensions();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const languageName = LANGUAGES.find((item) => item.id === locale)?.native ?? 'English';

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;

  async function finish() {
    await completeOnboarding();
    if (replay && router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function next() {
    if (last) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        {index === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('language.change')}
            onPress={() => router.push('/language')}
            style={[styles.language, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Ionicons name="globe-outline" size={18} color={theme.primary} />
            <ThemedText style={styles.languageText}>{languageName}</ThemedText>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </Pressable>
        ) : (
          <View />
        )}
        {last ? <View style={styles.skip} /> : (
          <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={8} style={styles.skip}>
            <ThemedText themeColor="textSecondary" style={styles.skipText}>{t('common.skip')}</ThemedText>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.art, { backgroundColor: `${item.color}18` }]}>
              {item.icon ? <Ionicons name={item.icon} size={84} color={item.color} /> : <OrdinaMark size={120} color={theme.primary} />}
            </View>
            <ThemedText style={styles.title} accessibilityRole="header">{t(`intro.${item.key}Title`)}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>{t(`intro.${item.key}Body`)}</ThemedText>
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots} accessible accessibilityLabel={t('intro.progress', { n: index + 1, total: SLIDES.length })}>
          {SLIDES.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, { backgroundColor: i === index ? theme.primary : theme.border, width: i === index ? 22 : 8 }]} />
          ))}
        </View>
        <PrimaryButton label={last ? t('common.getStarted') : t('common.next')} onPress={next} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  language: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 44 },
  languageText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  skip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 4 },
  skipText: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  art: { width: 220, height: 220, borderRadius: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 26, lineHeight: 34, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 420 },
  bottom: { paddingHorizontal: 24, paddingBottom: 16, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
});
