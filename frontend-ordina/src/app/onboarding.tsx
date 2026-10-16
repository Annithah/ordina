import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingArt } from '@/components/onboarding-art';
import { PrimaryButton } from '@/components/primary-button';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore, type OnboardingAnswers } from '@/store/preferences-store';
import { href } from '@/utils/href';
import { FEATURES } from '@/config/release';

type IconName = keyof typeof Ionicons.glyphMap;
type Option = { id: string; label: string; icon: IconName };
type Question = { id: string; title: string; subtitle: string; multi: boolean; options: Option[] };

const QUESTIONS: Question[] = [
  {
    id: 'focus',
    title: 'What would you like ORDINA to help you with?',
    subtitle: 'Pick everything that applies.',
    multi: true,
    options: [
      { id: 'work', label: 'Work & career', icon: 'briefcase-outline' },
      { id: 'study', label: 'School & studies', icon: 'school-outline' },
      { id: 'family', label: 'Home & family', icon: 'home-outline' },
      { id: 'health', label: 'Health & fitness', icon: 'fitness-outline' },
      { id: 'business', label: 'My business or side project', icon: 'rocket-outline' },
    ],
  },
  {
    id: 'energy',
    title: 'When do you do your best work?',
    subtitle: 'ORDINA will put important tasks in your strongest hours.',
    multi: false,
    options: [
      { id: 'early', label: 'Early morning (5–9 AM)', icon: 'partly-sunny-outline' },
      { id: 'morning', label: 'Late morning (9 AM–12 PM)', icon: 'sunny-outline' },
      { id: 'afternoon', label: 'Afternoon (12–5 PM)', icon: 'cafe-outline' },
      { id: 'evening', label: 'Evening (5–9 PM)', icon: 'moon-outline' },
      { id: 'night', label: "I'm a night owl", icon: 'star-outline' },
    ],
  },
  {
    id: 'style',
    title: 'How do you like to plan?',
    subtitle: 'You can always switch later.',
    multi: false,
    options: [
      { id: 'talk', label: 'I tell ORDINA in my own words', icon: 'chatbubbles-outline' },
      { id: 'auto', label: 'Plan my day for me', icon: 'sparkles-outline' },
      { id: 'manual', label: 'I like to plan everything myself', icon: 'create-outline' },
    ],
  },
  {
    id: 'blockers',
    title: 'What usually gets in your way?',
    subtitle: 'Be honest, ORDINA is here to help.',
    multi: true,
    options: [
      { id: 'overload', label: 'Too many things at once', icon: 'layers-outline' },
      { id: 'forget', label: 'I forget things', icon: 'help-circle-outline' },
      { id: 'procrastinate', label: 'Putting things off', icon: 'hourglass-outline' },
      { id: 'interruptions', label: 'Unexpected interruptions', icon: 'flash-outline' },
    ],
  },
  {
    id: 'reminders',
    title: 'How should ORDINA remind you?',
    subtitle: 'We will only notify you the way you choose.',
    multi: false,
    options: [
      { id: 'before', label: 'A few minutes before each task', icon: 'alarm-outline' },
      { id: 'night', label: 'A summary the night before', icon: 'calendar-outline' },
      { id: 'important', label: 'Only for important things', icon: 'flag-outline' },
      { id: 'none', label: "I'll check the app myself", icon: 'notifications-off-outline' },
    ],
  },
];

/** Personal promises shown at the end, based on what the user picked. */
function personalPlan(answers: OnboardingAnswers) {
  const lines: { icon: IconName; text: string }[] = [];
  const energy = answers.energy?.[0];
  const energyText: Record<string, string> = {
    early: 'Schedule your most important work early in the morning',
    morning: 'Protect your late mornings for deep work',
    afternoon: 'Keep your afternoons for the tasks that matter most',
    evening: 'Plan focused time in your evenings',
    night: 'Respect your night-owl rhythm when planning',
  };
  if (energy) lines.push({ icon: 'sunny-outline', text: energyText[energy] });
  if (answers.blockers?.includes('overload')) lines.push({ icon: 'layers-outline', text: 'Break busy days into a calm, clear plan' });
  if (answers.blockers?.includes('forget')) lines.push({ icon: 'alarm-outline', text: 'Remind you before anything slips' });
  if (answers.blockers?.includes('procrastinate')) lines.push({ icon: 'play-circle-outline', text: 'Tell you exactly what to do next' });
  if (answers.blockers?.includes('interruptions')) lines.push({ icon: 'swap-horizontal-outline', text: 'Re-plan your day when things change' });
  if (answers.style?.[0] === 'talk') lines.push({ icon: 'mic-outline', text: 'Turn what you say or snap into tasks' });
  if (lines.length < 3) lines.push({ icon: 'stats-chart-outline', text: 'Show your progress every day and month' });
  if (lines.length < 3) lines.push({ icon: 'calendar-outline', text: 'Keep your tasks and calendar in sync' });
  return lines.slice(0, 4);
}

export default function OnboardingScreen() {
  const theme = useTheme();
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
        <Animated.View style={[styles.welcomeCopy, { opacity: fade }]}>
          <ThemedText style={[styles.headline, compact && styles.headlineCompact]}>Tell ORDINA what you need to do</ThemedText>
          <ThemedText style={[styles.subhead, { color: theme.primary }]}>Put order in your day</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            Answer a few quick questions so ORDINA can plan the way you work. It takes less than a minute.
          </ThemedText>
        </Animated.View>
        <View style={styles.actions}>
          <PrimaryButton glow label="Get started" onPress={() => setStep(0)} />
          <Pressable onPress={() => void goTo('/sign-in')} style={styles.textButton}>
            <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
              I already have an account
            </ThemedText>
          </Pressable>
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
              <ThemedText style={styles.questionTitle}>You&apos;re all set!</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>Here is how ORDINA will help you:</ThemedText>
            </View>
            <View style={[styles.planCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {personalPlan(answers).map((line) => (
                <View key={line.text} style={styles.planRow}>
                  <View style={[styles.planIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={line.icon} size={18} color={theme.primary} />
                  </View>
                  <ThemedText style={styles.planText}>{line.text}</ThemedText>
                </View>
              ))}
            </View>
            {isSignedIn ? (
              <PrimaryButton label="Back to ORDINA" onPress={() => router.replace(href('/(tabs)'))} />
            ) : (
              <>
            <ThemedText style={styles.sectionLabel}>Create your free account</ThemedText>
            {FEATURES.socialSignIn ? <SocialAuthButtons /> : null}
            <Pressable
              onPress={() => void goTo('/sign-up')}
              style={[styles.emailButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Ionicons name="mail-outline" size={20} color={theme.text} />
              <ThemedText style={styles.emailLabel}>Continue with email</ThemedText>
            </Pressable>
            <Pressable onPress={() => void goTo('/sign-in')} style={styles.textButton}>
              <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
                I already have an account · <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>Sign in</ThemedText>
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
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={() => setStep((current) => current - 1)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${((step + 1) / QUESTIONS.length) * 100}%` }]} />
        </View>
        <Pressable hitSlop={10} onPress={() => setStep(QUESTIONS.length)}>
          <ThemedText themeColor="textSecondary" style={styles.skipAll}>Skip all</ThemedText>
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
            Question {step + 1} of {QUESTIONS.length}
          </ThemedText>
          <ThemedText style={[styles.questionTitle, compact && styles.headlineCompact]}>{question!.title}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>{question!.subtitle}</ThemedText>
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
                  <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
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
          label={step === QUESTIONS.length - 1 ? 'Finish' : 'Next'}
          disabled={!selected.length}
          onPress={() => setStep((current) => current + 1)}
        />
        <Pressable onPress={() => setStep((current) => current + 1)} style={styles.textButton}>
          <ThemedText themeColor="textSecondary" style={styles.textButtonLabel}>
            Skip this question
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
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
