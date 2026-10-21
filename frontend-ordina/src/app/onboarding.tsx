import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageButton } from '@/components/language-picker';
import { OnboardingArt } from '@/components/onboarding-art';
import { PrimaryButton } from '@/components/primary-button';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { ThemedText } from '@/components/themed-text';
import { focusCategories } from '@/features/categories';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore, type OnboardingAnswers } from '@/store/preferences-store';
import { href } from '@/utils/href';

type IconName = keyof typeof Ionicons.glyphMap;
type Question = { id: QuestionId; multi: boolean; options: { id: string; icon: IconName }[] };
type QuestionId = 'focus' | 'energy' | 'style' | 'blockers' | 'reminders';
type T = (path: string, vars?: Record<string, string | number>) => string;

// Texts live in i18n (onboarding.questions.<id>.options.<option>); only ids and icons are here.
const QUESTIONS: Question[] = [
  {
    id: 'focus',
    multi: true,
    options: [
      { id: 'work', icon: 'briefcase-outline' },
      { id: 'study', icon: 'school-outline' },
      { id: 'health', icon: 'fitness-outline' },
      { id: 'family', icon: 'home-outline' },
      { id: 'business', icon: 'rocket-outline' },
      { id: 'finance', icon: 'wallet-outline' },
      { id: 'social', icon: 'people-outline' },
      { id: 'creative', icon: 'color-palette-outline' },
    ],
  },
  {
    id: 'energy',
    multi: false,
    options: [
      { id: 'early', icon: 'partly-sunny-outline' },
      { id: 'morning', icon: 'sunny-outline' },
      { id: 'afternoon', icon: 'cafe-outline' },
      { id: 'evening', icon: 'moon-outline' },
      { id: 'night', icon: 'star-outline' },
    ],
  },
  {
    id: 'style',
    multi: false,
    options: [
      { id: 'talk', icon: 'chatbubbles-outline' },
      { id: 'auto', icon: 'sparkles-outline' },
      { id: 'manual', icon: 'create-outline' },
    ],
  },
  {
    id: 'blockers',
    multi: true,
    options: [
      { id: 'overload', icon: 'layers-outline' },
      { id: 'forget', icon: 'help-circle-outline' },
      { id: 'procrastinate', icon: 'hourglass-outline' },
      { id: 'interruptions', icon: 'flash-outline' },
    ],
  },
  {
    id: 'reminders',
    multi: false,
    options: [
      { id: 'before', icon: 'alarm-outline' },
      { id: 'night', icon: 'calendar-outline' },
      { id: 'important', icon: 'flag-outline' },
      { id: 'none', icon: 'notifications-off-outline' },
    ],
  },
];

/** Personal promises shown at the end, based on what the user picked. */
function personalPlan(answers: OnboardingAnswers, t: T) {
  const lines: { icon: IconName; text: string }[] = [];
  const chosen = focusCategories(answers);
  if (chosen.length) {
    const list = chosen.slice(0, 3).map((id) => t(`categories.defaults.${id}`)).join(', ');
    lines.push({ icon: 'pricetags-outline', text: t('onboarding.plan.categories', { list }) });
  }
  const energy = answers.energy?.[0];
  if (energy) lines.push({ icon: 'sunny-outline', text: t(`onboarding.plan.${energy}`) });
  const blockerIcons: Record<string, IconName> = {
    overload: 'layers-outline',
    forget: 'alarm-outline',
    procrastinate: 'play-circle-outline',
    interruptions: 'swap-horizontal-outline',
  };
  for (const blocker of answers.blockers ?? []) {
    if (blockerIcons[blocker]) lines.push({ icon: blockerIcons[blocker], text: t(`onboarding.plan.${blocker}`) });
  }
  if (answers.style?.[0] === 'talk') lines.push({ icon: 'mic-outline', text: t('onboarding.plan.talk') });
  if (lines.length < 3) lines.push({ icon: 'stats-chart-outline', text: t('onboarding.plan.progress') });
  if (lines.length < 3) lines.push({ icon: 'calendar-outline', text: t('onboarding.plan.calendar') });
  return lines.slice(0, 4);
}

export default function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const saveAnswers = usePreferencesStore((s) => s.saveAnswers);
  // -1 = welcome, 0..n-1 = questions, n = finish
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const fade = useRef(new Animated.Value(1)).current;
  const finished = step >= QUESTIONS.length;
  const question = step >= 0 && !finished ? QUESTIONS[step] : null;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [step, fade]);

  useEffect(() => {
    if (!finished) return;
    void saveAnswers(answers);
    void completeOnboarding();
  }, [finished, answers, saveAnswers, completeOnboarding]);

  function toggle(option: string) {
    if (!question) return;
    setAnswers((current) => {
      const selected = current[question.id] ?? [];
      if (!question.multi) return { ...current, [question.id]: [option] };
      return {
        ...current,
        [question.id]: selected.includes(option) ? selected.filter((id) => id !== option) : [...selected, option],
      };
    });
  }

  async function goTo(path: '/sign-in' | '/sign-up') {
    await saveAnswers(answers);
    await completeOnboarding();
    router.replace(href(path));
  }

  const selected = question ? answers[question.id] ?? [] : [];
  const compact = height < 700;

  if (step === -1) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <OnboardingArt />
        {/* Top-left, away from the logo on the right; floats so the welcome layout stays the same. */}
        <View style={[styles.languageCorner, { top: insets.top + 10 }]}>
          <LanguageButton />
        </View>
        <Animated.View style={[styles.welcomeCopy, { opacity: fade }]}>
          <ThemedText style={[styles.headline, compact && styles.headlineCompact]}>{t('onboarding.headline')}</ThemedText>
          <ThemedText style={[styles.subhead, { color: theme.primary }]}>{t('onboarding.subhead')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            {t('onboarding.body')}
          </ThemedText>
        </Animated.View>
        <View style={styles.actions}>
          <PrimaryButton glow label={t('onboarding.getStarted')} onPress={() => setStep(0)} />
          <Pressable onPress={() => void goTo('/sign-in')} style={styles.textButton}>
            <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
              {t('onboarding.haveAccount')}
            </ThemedText>
          </Pressable>
          {/* Shows which version is installed, so testers can tell an old copy from a new one. */}
          <ThemedText themeColor="textSecondary" style={styles.version}>v{Constants.expoConfig?.version}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.finishScroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade, gap: 18 }}>
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="checkmark-done" size={28} color={theme.primary} />
            </View>
            <View style={{ gap: 6 }}>
              <ThemedText style={styles.questionTitle}>{t('onboarding.allSet')}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>{t('onboarding.howHelp')}</ThemedText>
            </View>
            <View style={[styles.planCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {personalPlan(answers, t).map((line) => (
                <View key={line.text} style={styles.planRow}>
                  <View style={[styles.planIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={line.icon} size={18} color={theme.primary} />
                  </View>
                  <ThemedText style={styles.planText}>{line.text}</ThemedText>
                </View>
              ))}
            </View>
            {isSignedIn ? (
              <PrimaryButton label={t('onboarding.backToApp')} onPress={() => router.replace(href('/(tabs)'))} />
            ) : (
              <>
                <ThemedText style={styles.sectionLabel}>{t('onboarding.createAccount')}</ThemedText>
                <SocialAuthButtons />
                <Pressable
                  onPress={() => void goTo('/sign-up')}
                  style={[styles.emailButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <Ionicons name="mail-outline" size={20} color={theme.text} />
                  <ThemedText style={styles.emailLabel}>{t('onboarding.continueEmail')}</ThemedText>
                </Pressable>
                <Pressable onPress={() => void goTo('/sign-in')} style={styles.textButton}>
                  <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
                    {t('onboarding.alreadyHave')} · <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('onboarding.signInLink')}</ThemedText>
                  </ThemedText>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel={t('common.back')} hitSlop={10} onPress={() => setStep((current) => current - 1)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${((step + 1) / QUESTIONS.length) * 100}%` }]} />
        </View>
        <Pressable hitSlop={10} onPress={() => setStep(QUESTIONS.length)}>
          <ThemedText themeColor="textSecondary" style={styles.skipAll}>{t('onboarding.skipAll')}</ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.questionScroll} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            opacity: fade,
            transform: [{ translateX: fade.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            gap: 8,
          }}>
          <ThemedText themeColor="textSecondary" style={styles.stepLabel}>
            {t('onboarding.questionOf', { n: step + 1, total: QUESTIONS.length })}
          </ThemedText>
          <ThemedText style={[styles.questionTitle, compact && styles.headlineCompact]}>{t(`onboarding.questions.${question!.id}.title`)}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>{t(`onboarding.questions.${question!.id}.subtitle`)}</ThemedText>
          <View style={styles.options}>
            {question!.options.map((option) => {
              const active = selected.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole={question!.multi ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: active }}
                  onPress={() => toggle(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: active ? theme.backgroundSelected : theme.card,
                      borderColor: active ? theme.primary : theme.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <View style={[styles.optionIcon, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
                    <Ionicons name={option.icon} size={18} color={active ? '#FFFFFF' : theme.primary} />
                  </View>
                  <ThemedText style={styles.optionLabel}>{t(`onboarding.questions.${question!.id}.options.${option.id}`)}</ThemedText>
                  <Ionicons
                    name={active ? (question!.multi ? 'checkbox' : 'radio-button-on') : (question!.multi ? 'square-outline' : 'radio-button-off')}
                    size={22}
                    color={active ? theme.primary : theme.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label={step === QUESTIONS.length - 1 ? t('onboarding.finish') : t('common.next')}
          disabled={!selected.length}
          onPress={() => setStep((current) => current + 1)}
        />
        <Pressable onPress={() => setStep((current) => current + 1)} style={styles.textButton}>
          <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
            {t('onboarding.skipQuestion')}
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  version: { fontSize: 11, textAlign: 'center' },
  languageCorner: { position: 'absolute', left: 20, zIndex: 2 },
  welcomeCopy: { flex: 1, justifyContent: 'flex-end', paddingBottom: 28, gap: 8 },
  headline: { fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold' },
  headlineCompact: { fontSize: 24, lineHeight: 32 },
  subhead: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  body: { fontSize: 15, lineHeight: 22 },
  actions: { paddingBottom: 16, paddingTop: 8, gap: 8 },
  textButton: { alignItems: 'center', paddingVertical: 10 },
  textButtonLabel: { fontSize: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  skipAll: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  questionScroll: { paddingTop: 12, paddingBottom: 16 },
  stepLabel: { fontSize: 12, fontFamily: 'Poppins_500Medium', letterSpacing: 0.5 },
  questionTitle: { fontSize: 26, lineHeight: 34, fontFamily: 'Poppins_700Bold' },
  options: { gap: 10, marginTop: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  finishScroll: { paddingTop: 32, paddingBottom: 24 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  planCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  planText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium' },
  sectionLabel: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
  emailButton: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 16 },
  emailLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
});
