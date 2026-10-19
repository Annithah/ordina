/**
 * ORDINA AI: describe your day (typed or spoken) and get a plan to review before anything is
 * saved. The plan is saved on the phone. ORDINA AI needs the internet: when offline, nothing is
 * sent, the text stays in the box, and an "Offline" banner shows until the connection returns.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrdinaMark } from '@/components/ordina-mark';
import { PlanReview } from '@/components/plan-review';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { confirmPlan, requestPlan, transcribeAudio } from '@/services/ai';
import { isOnline, useOnline } from '@/services/network';
import { useTasksStore } from '@/store/tasks-store';
import type { DraftTask, Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';
import { mergeReplan, toConfirmPayload, toDrafts, toKeepTasks } from '@/utils/plan-draft';
import { friendlyError } from '@/utils/task-validation';

type State = 'ready' | 'listening' | 'transcribing' | 'thinking' | 'review' | 'done' | 'error';

const STATE_KEY: Record<State, string> = {
  ready: 'ai.stateReady',
  listening: 'ai.stateListening',
  transcribing: 'ai.stateTranscribing',
  thinking: 'ai.stateThinking',
  review: 'ai.stateReview',
  done: 'ai.stateDone',
  error: 'ai.stateError',
};

const MAX_AUDIO_BYTES = 4_500_000;

function fileSize(uri: string) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

export default function OrdinaAiScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const categories = useTasksStore((s) => s.categories);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [state, setState] = useState<State>('ready');
  const [recording, setRecording] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answered, setAnswered] = useState<{ question: string; answer: string }[]>([]);
  const [planRequest, setPlanRequest] = useState('');
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [slow, setSlow] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; retry?: () => void } | null>(null);

  const busy = state === 'transcribing' || planning || replanning || savingPlan;
  const categoryIds = categories.map((category) => category.id);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setKeyboardOpen(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // The connection came back: the offline message goes away by itself.
  useEffect(() => {
    if (online) setOfflineNotice(false);
  }, [online]);

  // The free server can take up to a minute to wake: say so instead of a silent spinner.
  useEffect(() => {
    if (!planning) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [planning]);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

  function failure(error: unknown, fallback: string) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'SERVER_UNREACHABLE') return t('ai.serverUnreachable');
    return friendlyError(error, fallback);
  }

  /** Checks the connection first; offline means nothing is sent and the text is kept. */
  async function requireOnline() {
    if (await isOnline()) return true;
    setOfflineNotice(true);
    setAiError(null);
    scrollDown();
    return false;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (!(await requireOnline())) return;
    setAiError(null);
    setPlanning(true);
    setState('thinking');
    try {
      const next = await requestPlan({ message });
      setPlan(next);
      setDrafts(toDrafts(next.tasks, categoryIds));
      setAnswers({});
      setAnswered([]);
      setPlanRequest(message);
      setHistory((rows) => [...rows, { role: 'user', content: message }, { role: 'assistant', content: next.summary }]);
      setDraft('');
      setState(next.tasks.length || next.questions.length ? 'review' : 'done');
      scrollDown();
    } catch (error) {
      setState('error');
      setAiError({ message: failure(error, t('ai.couldNotPlan')), retry: () => void send(message) });
    } finally {
      setPlanning(false);
    }
  }

  async function submitAnswers() {
    if (!plan || busy) return;
    const newAnswers = plan.questions
      .map((question) => ({ question: question.question, answer: (answers[question.id] ?? '').trim() }))
      .filter((item) => item.answer);
    if (!newAnswers.length) return;
    if (!(await requireOnline())) return;
    const allAnswers = [...answered, ...newAnswers];
    setAiError(null);
    setReplanning(true);
    try {
      const next = await requestPlan({ message: planRequest, answers: allAnswers, keepTasks: toKeepTasks(drafts) });
      setPlan(next);
      setDrafts(mergeReplan(drafts, next.tasks, categoryIds));
      setAnswers({});
      setAnswered(allAnswers);
      setHistory((rows) => [...rows, { role: 'user', content: newAnswers.map((item) => item.answer).join(' · ') }, { role: 'assistant', content: next.summary }]);
    } catch (error) {
      setAiError({ message: failure(error, t('ai.couldNotUpdate')), retry: () => void submitAnswers() });
    } finally {
      setReplanning(false);
    }
  }

  /** Saving works offline: the plan is written to the phone. */
  async function addPlanToTasks() {
    if (!plan || savingPlan || !drafts.length) return;
    setAiError(null);
    setSavingPlan(true);
    try {
      const saved = await confirmPlan(plan.planId, toConfirmPayload(drafts));
      await loadTasks();
      useTasksStore.setState((s) => ({ version: s.version + 1 }));
      const count = saved.created.length;
      toast.success(t('task.addedMany', { count }));
      setHistory((rows) => [...rows, { role: 'assistant', content: t('ai.added', { count }) }]);
      setPlan(null);
      setDrafts([]);
      setState('done');
      if (count) router.push({ pathname: '/schedule-created', params: { taskIds: saved.created.map((task) => task.id).join(',') } });
    } catch (error) {
      setAiError({ message: failure(error, t('ai.couldNotSave')), retry: () => void addPlanToTasks() });
    } finally {
      setSavingPlan(false);
    }
  }

  function cancelPlan() {
    setPlan(null);
    setDrafts([]);
    setAnswers({});
    setAnswered([]);
    setAiError(null);
    setState('ready');
    setHistory((rows) => [...rows, { role: 'assistant', content: t('ai.discarded') }]);
  }

  async function toggleVoice() {
    try {
      if (Platform.OS === 'web') {
        toast.info(t('ai.voiceWeb'));
        return;
      }
      if (recording) {
        setRecording(false);
        setState('transcribing');
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        const uri = recorder.uri;
        if (!uri) {
          setState('error');
          toast.error(t('ai.voiceSaveFailed'));
          return;
        }
        if (fileSize(uri) > MAX_AUDIO_BYTES) {
          setState('error');
          toast.error(t('ai.voiceTooLong'));
          return;
        }
        if (!(await requireOnline())) {
          setState('ready');
          return;
        }
        const text = await transcribeAudio(await new File(uri).base64(), 'audio/mp4');
        if (!text.trim()) {
          setState('error');
          toast.error(t('ai.voiceNoWords'));
          return;
        }
        // Voice only fills the text box; the user reviews it and sends it like typed text.
        setDraft((current) => (current.trim() ? `${current.trim()} ${text.trim()}` : text.trim()));
        setState('ready');
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }
      if (!(await requireOnline())) return;
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setState('error');
        setAiError({ message: t('ai.micDenied') });
        return;
      }
      Keyboard.dismiss();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setState('listening');
    } catch (error) {
      setRecording(false);
      setState('error');
      setAiError({ message: failure(error, t('ai.voiceUnavailable')) });
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <OrdinaMark size={36} />
          <ThemedText style={styles.headerText} accessibilityRole="header">{t('ai.title')}</ThemedText>
        </View>
        <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
          {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          <ThemedText style={[styles.pillText, { color: theme.primary }]}>{t(STATE_KEY[state])}</ThemedText>
        </View>
      </View>

      {!online ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: theme.warning }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#0F172A" />
          <ThemedText style={styles.bannerText}>{t('offline.banner')}</ThemedText>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {history.length === 0 ? (
            <View style={[styles.welcome, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={styles.welcomeTitle}>{t('ai.welcomeTitle')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('ai.welcomeBody')}</ThemedText>
            </View>
          ) : null}

          {history.slice(-12).map((item, index) => {
            const mine = item.role === 'user';
            return (
              <View key={`${item.role}-${index}`} style={[mine ? styles.userBubble : styles.aiBubble, { backgroundColor: mine ? theme.primary : theme.card }]}>
                <ThemedText style={mine ? { color: theme.onPrimary } : undefined}>{item.content}</ThemedText>
              </View>
            );
          })}

          {busy ? (
            <View style={[styles.aiBubble, styles.typing, { backgroundColor: theme.card }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText themeColor="textSecondary" style={{ flexShrink: 1 }}>
                {planning ? (slow ? t('ai.waking') : t('ai.planning')) : replanning ? t('ai.updating') : savingPlan ? t('ai.adding') : t('ai.stateTranscribing')}
              </ThemedText>
            </View>
          ) : null}

          {offlineNotice ? (
            <View accessibilityRole="alert" style={[styles.offline, { backgroundColor: theme.card, borderColor: theme.warning }]}>
              <View style={styles.offlineHead}>
                <Ionicons name="cloud-offline-outline" size={22} color={theme.warning} />
                <ThemedText style={styles.welcomeTitle}>{t('offline.title')}</ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">{t('offline.message')}</ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/new-task', params: draft.trim() ? { title: draft.trim() } : {} })}
                style={[styles.offlineButton, { borderColor: theme.primary }]}>
                <Ionicons name="add" size={18} color={theme.primary} />
                <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('offline.addManually')}</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {plan ? (
            <PlanReview
              summary={plan.summary}
              tasks={drafts}
              questions={plan.questions}
              assumptions={plan.assumptions}
              answers={answers}
              today={plan.today || localDateKey()}
              saving={savingPlan}
              replanning={replanning}
              onChangeTasks={setDrafts}
              onAnswer={(id, text) => setAnswers((current) => ({ ...current, [id]: text }))}
              onSubmitAnswers={() => void submitAnswers()}
              onConfirm={() => void addPlanToTasks()}
              onCancel={cancelPlan}
            />
          ) : null}
        </ScrollView>

        {aiError ? (
          <View accessibilityRole="alert" style={[styles.errorBar, { borderColor: theme.danger, backgroundColor: theme.card }]}>
            <Ionicons name="alert-circle" size={18} color={theme.danger} />
            <ThemedText style={styles.errorText}>{aiError.message}</ThemedText>
            {aiError.retry ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={aiError.retry} style={styles.errorAction}>
                <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('common.retry')}</ThemedText>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t('ai.dismiss')} onPress={() => setAiError(null)} style={styles.errorAction}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: keyboardOpen ? 8 : 16 }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={state === 'listening' ? t('ai.listeningPlaceholder') : t('ai.placeholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            editable={!planning}
            accessibilityLabel={t('ai.placeholder')}
            maxLength={2000}
            style={[styles.input, { color: theme.text }]}
          />
          {Platform.OS === 'web' ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state === 'listening' ? t('ai.stopRecording') : t('ai.speak')}
              disabled={busy && state !== 'listening'}
              onPress={() => void toggleVoice()}
              style={[styles.round, { backgroundColor: state === 'listening' ? theme.danger : theme.secondary }]}>
              <Ionicons name={state === 'listening' ? 'stop' : 'mic'} size={18} color="#FFFFFF" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ai.send')}
            disabled={busy || !draft.trim()}
            onPress={() => void send(draft)}
            style={[styles.round, { backgroundColor: theme.primary, opacity: busy || !draft.trim() ? 0.5 : 1 }]}>
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  headerText: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 140 },
  pillText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, flexShrink: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  bannerText: { color: '#0F172A', fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  chat: { padding: 16, gap: 12, paddingBottom: 24, width: '100%', maxWidth: 760, alignSelf: 'center' },
  welcome: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  welcomeTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, flexShrink: 1 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
  aiBubble: { alignSelf: 'flex-start', maxWidth: '90%', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offline: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  offlineHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, minHeight: 48, marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: 16, marginTop: 10, borderRadius: 26, borderWidth: 1, padding: 6, gap: 6 },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 15, paddingVertical: 10, paddingHorizontal: 8, minHeight: 44, maxHeight: 120 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  errorText: { flex: 1, fontSize: 13, paddingVertical: 10 },
  errorAction: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
});
