import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrdinaMark } from '@/components/ordina-mark';
import { PlanReview } from '@/components/plan-review';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { aiNoticeKind, isOnline, type AiNoticeKind } from '@/services/connectivity';
import { LAPTOP_MESSAGE } from '@/services/device-session';
import { confirmAiActions, confirmPlan, fetchAiMessages, interpretFromMedia, interpretInstruction, requestPlan, transcribeAudio } from '@/services/ai';
import { MAX_MEDIA_BYTES, matchingContacts, pickTaskMedia, type MediaSource } from '@/services/device-integrations';
import {
  createGoogleCalendarEvents,
  getGoogleCalendarBusyEvents,
  getGoogleCalendarConnection,
} from '@/services/google-calendar';
import { scheduleTaskReminder } from '@/services/notifications';
import { useAuthStore } from '@/store/auth-store';
import { useTasksStore } from '@/store/tasks-store';
import type { DraftTask, Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';
import { mergeReplan, toConfirmPayload, toDrafts, toKeepTasks } from '@/utils/plan-draft';
import { friendlyError } from '@/utils/task-validation';
import { FEATURES } from '@/config/release';
import { useNetworkState } from 'expo-network';

type VoiceState = 'ready' | 'listening' | 'processing' | 'understanding' | 'confirmation' | 'completed' | 'error';

const STATE_LABEL: Record<VoiceState, string> = {
  ready: 'Ready',
  listening: 'Listening…',
  processing: 'Transcribing…',
  understanding: 'Thinking…',
  confirmation: 'Review',
  completed: 'Done',
  error: 'Try again',
};

const REMINDER_LEAD_MINUTES = 10;

type ProposedTask = {
  id?: string;
  title: string;
  description?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  priority?: string;
  reminder?: boolean;
  reason?: string;
  contactName?: string;
  contactPhone?: string;
  conflictsWith?: string[];
  suggestedStartTime?: string;
};

const QUICK_PROMPTS = ['Plan my day', 'What should I do now?', "I'm overwhelmed", 'Plan my week'];

function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function friendlyDate(date?: string) {
  if (!date) return '';
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function errorMessage(error: any, fallback: string) {
  if (error?.code === 'LAPTOP_UNREACHABLE') return LAPTOP_MESSAGE;
  const message: string = error?.response?.data?.message || error?.message || '';
  if (/not configured|GEMINI_API_KEY/i.test(message)) {
    return 'Voice, photo and video need ORDINA AI to be switched on for the server (GEMINI_API_KEY). You can still type your request.';
  }
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return 'ORDINA AI took too long to answer. Try a shorter clip or check your connection.';
  }
  if (/Network Error/i.test(message)) {
    return 'Cannot reach the ORDINA server. Check that your phone and computer are on the same network.';
  }
  return message || fallback;
}

/** Server AI errors already carry a friendly message; everything else gets a plain explanation. */
function aiErrorMessage(error: any, fallback: string) {
  if (error?.code === 'LAPTOP_UNREACHABLE') return LAPTOP_MESSAGE;
  if (error?.response?.data?.code && error.response.data.message) return String(error.response.data.message);
  return friendlyError(error, fallback);
}

/** Reads a local file picked/recorded on the device as base64. */
async function readBase64(uri: string) {
  return new File(uri).base64();
}

function fileSize(uri: string) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

type AiNotice = { kind: AiNoticeKind; message?: string; retry?: () => void };

const NOTICE_ICON: Record<AiNoticeKind, keyof typeof Ionicons.glyphMap> = {
  offline: 'cloud-offline-outline',
  unreachable: 'cafe-outline',
  slow: 'hourglass-outline',
  problem: 'information-circle-outline',
};

export default function OrdinaAiScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const network = useNetworkState();
  const isOffline = network.isConnected === false || network.isInternetReachable === false;
  const ordinaUserId = useAuthStore((state) => state.user?.id);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [result, setResult] = useState<any>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [voice, setVoice] = useState<VoiceState>('ready');
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // A picked photo/video waits here until the user says what to do with it.
  const [attachment, setAttachment] = useState<{ uri: string; mimeType: string; isVideo: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // ORDINA AI plan (typed requests): review before anything is saved.
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answered, setAnswered] = useState<{ question: string; answer: string }[]>([]);
  const [planRequest, setPlanRequest] = useState('');
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [aiError, setAiError] = useState<AiNotice | null>(null);

  /** Explains a failed AI request calmly: offline, AI not reachable, slow, or the server's own message. */
  async function showNotice(error: unknown, fallback: string, retry: () => void) {
    const kind: AiNoticeKind = (await isOnline()) ? aiNoticeKind(error) : 'offline';
    setAiError({ kind, message: kind === 'problem' ? aiErrorMessage(error, fallback) : undefined, retry });
  }

  /** No internet: say so before sending anything; the user's text stays where it is. */
  async function stopIfOffline(retry: () => void) {
    if (await isOnline()) return false;
    setAiError({ kind: 'offline', retry });
    return true;
  }

  const busy = voice === 'understanding' || voice === 'processing' || saving || planning || replanning || savingPlan;

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

  useEffect(() => {
    void fetchAiMessages()
      .then((messages) => setHistory(messages.map((item: any) => ({ role: item.role, content: item.content }))))
      .catch(() => undefined);
  }, []);

  function showResult(data: any) {
    setResult(data);
    setExcluded(new Set());
    setHistory((rows) => [...rows, { role: 'assistant', content: data.message || 'Here is what I understood.' }]);
    setVoice(data.tasks?.length || data.reschedule || data.arrivalReminders?.length ? 'confirmation' : 'completed');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function calendarEvents() {
    if (!ordinaUserId || !FEATURES.googleCalendar) return [];
    return getGoogleCalendarBusyEvents(ordinaUserId).catch(() => []);
  }

  /** Typed request: ask ORDINA for a plan. The text stays in the box until a plan arrives. */
  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (attachment) {
      await sendWithAttachment(message);
      return;
    }
    setAiError(null);
    if (await stopIfOffline(() => void send(message))) return;
    setAttachOpen(false);
    setResult(null);
    setPlanning(true);
    setVoice('understanding');
    try {
      const next = await requestPlan({ message });
      setPlan(next);
      setDrafts(toDrafts(next.tasks));
      setAnswers({});
      setAnswered([]);
      setPlanRequest(message);
      setHistory((rows) => [...rows, { role: 'user', content: message }, { role: 'assistant', content: next.summary }]);
      setDraft('');
      setVoice(next.tasks.length || next.questions.length ? 'confirmation' : 'completed');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      setVoice('error');
      await showNotice(error, 'ORDINA AI could not plan that. Please try again.', () => void send(message));
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
    const allAnswers = [...answered, ...newAnswers];
    setAiError(null);
    if (await stopIfOffline(() => void submitAnswers())) return;
    setReplanning(true);
    try {
      const next = await requestPlan({ message: planRequest, answers: allAnswers, keepTasks: toKeepTasks(drafts) });
      setPlan(next);
      setDrafts(mergeReplan(drafts, next.tasks));
      setAnswers({});
      setAnswered(allAnswers);
      setHistory((rows) => [...rows, { role: 'user', content: newAnswers.map((item) => item.answer).join(' · ') }, { role: 'assistant', content: next.summary }]);
    } catch (error) {
      await showNotice(error, 'ORDINA AI could not update the plan. Please try again.', () => void submitAnswers());
    } finally {
      setReplanning(false);
    }
  }

  async function addPlanToTasks() {
    if (!plan || savingPlan || !drafts.length) return;
    setAiError(null);
    setSavingPlan(true);
    try {
      const saved = await confirmPlan(plan.planId, toConfirmPayload(drafts));
      await loadTasks();
      const count = saved.created.length;
      toast.success(`Added ${count} task${count === 1 ? '' : 's'} to your plan`);
      setHistory((rows) => [...rows, { role: 'assistant', content: `Added ${count} task${count === 1 ? '' : 's'} to your plan.` }]);
      setPlan(null);
      setDrafts([]);
      setVoice('completed');
      if (count) router.push({ pathname: '/schedule-created', params: { taskIds: saved.created.map((task) => task.id).join(',') } });
    } catch (error) {
      await showNotice(error, 'Your plan could not be saved. Please try again.', () => void addPlanToTasks());
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
    setVoice('ready');
    setHistory((rows) => [...rows, { role: 'assistant', content: 'Plan discarded. Nothing was saved.' }]);
  }

  /** Quick prompts and replies to them use ORDINA's existing chat assistant. */
  async function sendLegacy(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setAiError(null);
    if (await stopIfOffline(() => void sendLegacy(message))) return;
    setPlan(null);
    setDrafts([]);
    setVoice('understanding');
    setAttachOpen(false);
    setResult(null);
    setHistory((rows) => [...rows, { role: 'user', content: message }]);
    setDraft('');
    try {
      const [contacts, events] = await Promise.all([
        FEATURES.contacts ? matchingContacts(message).catch(() => []) : Promise.resolve([]),
        calendarEvents(),
      ]);
      showResult(await interpretInstruction({ message, timezone: timezone(), contacts, calendarEvents: events }));
    } catch (error: any) {
      setVoice('error');
      await showNotice(error, errorMessage(error, 'Unable to reach ORDINA AI.'), () => void sendLegacy(message));
    }
  }

  async function confirm() {
    if (saving) return;
    setSaving(true);
    try {
      const chosen: ProposedTask[] = (result?.tasks ?? []).filter((_: ProposedTask, index: number) => !excluded.has(index));
      const saved = await confirmAiActions({
        tasks: chosen,
        reschedule: result?.reschedule,
        arrivalReminders: result?.arrivalReminders,
      }) as {
        created?: { id: string; title: string; dueDate?: string; startTime?: string; reminder?: boolean; contactName?: string }[];
        rescheduled?: { id: string; title: string; dueDate?: string; startTime?: string; reminder?: boolean; contactName?: string }[];
      };
      const followUpErrors: string[] = [];
      // Reminders are best-effort and run in the background: a pending permission
      // prompt must never keep the plan stuck on "Saving...".
      for (const task of [...(saved.created ?? []), ...(saved.rescheduled ?? [])]) {
        if (!FEATURES.taskReminders || !task.reminder || !task.dueDate) continue;
        const start = new Date(`${task.dueDate}T${task.startTime || '09:00'}:00`);
        const when = task.startTime ? new Date(start.getTime() - REMINDER_LEAD_MINUTES * 60_000) : start;
        void scheduleTaskReminder(String(task.id), task.title, when.getTime() > Date.now() ? when : start, {
          body: task.startTime
            ? `Starts at ${task.startTime}${task.contactName ? ` · ${task.contactName}` : ''}`
            : 'Planned for today',
        }).catch(() => undefined);
      }
      // Only new tasks become calendar events; moved tasks would otherwise be duplicated.
      const newTasks = chosen.filter((task) => !task.id);
      if (FEATURES.googleCalendar && newTasks.length && ordinaUserId && await getGoogleCalendarConnection(ordinaUserId).catch(() => null)) {
        try {
          await createGoogleCalendarEvents(newTasks, ordinaUserId);
        } catch (error) {
          followUpErrors.push(error instanceof Error ? error.message : 'Google Calendar could not be updated.');
        }
      }
      await loadTasks();
      setVoice('completed');
      setResult(null);
      setAttachment(null);
      if (followUpErrors.length) {
        Alert.alert('Plan saved with a warning', `Your tasks were saved, but ${followUpErrors.join(' ')}`);
      }
      const taskIds = [...(saved.created ?? []), ...(saved.rescheduled ?? [])].map((task) => task.id);
      if (taskIds.length) {
        router.push({ pathname: '/schedule-created', params: { taskIds: taskIds.join(',') } });
      }
    } catch (error: any) {
      Alert.alert('Confirm', errorMessage(error, 'Could not save those actions.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVoice() {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Voice', 'Voice capture is not available on web. Type your instruction instead.');
        return;
      }
      if (recording) {
        setRecording(false);
        setVoice('processing');
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        const uri = recorder.uri;
        if (!uri) {
          setVoice('error');
          Alert.alert('Voice', 'The recording could not be saved. Please try again.');
          return;
        }
        if (fileSize(uri) > 4_500_000) {
          Alert.alert('Voice', 'That recording is too long. Try a shorter message.');
          setVoice('error');
          return;
        }
        const text = await transcribeAudio(await readBase64(uri), 'audio/mp4');
        if (!text.trim()) {
          setVoice('error');
          Alert.alert('Voice', 'I could not hear any words. Please try speaking again.');
          return;
        }
        // Voice only fills the text box; the user reviews it and sends it like typed text.
        setDraft((current) => (current.trim() ? `${current.trim()} ${text.trim()}` : text.trim()));
        setVoice('ready');
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone', 'ORDINA needs the microphone to turn speech into tasks. You can enable it in Settings.');
        setVoice('error');
        return;
      }
      Keyboard.dismiss();
      setAttachOpen(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setVoice('listening');
    } catch (error: any) {
      setRecording(false);
      setVoice('error');
      Alert.alert('Voice', errorMessage(error, 'Voice capture is unavailable on this device.'));
    }
  }

  async function attach(source: MediaSource) {
    setAttachOpen(false);
    try {
      const asset = await pickTaskMedia(source);
      if (!asset?.uri) return;
      const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
      const size = asset.fileSize ?? fileSize(asset.uri);
      if (size && size > MAX_MEDIA_BYTES) {
        Alert.alert(isVideo ? 'Video too large' : 'Image too large', isVideo
          ? 'Please use a shorter clip (about 30 seconds or less).'
          : 'Please choose a smaller image.');
        return;
      }
      // Nothing is sent yet: the user first tells ORDINA what to do with it.
      setAttachment({ uri: asset.uri, isVideo, mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg') });
      setVoice('ready');
      setTimeout(() => inputRef.current?.focus(), 150);
    } catch (error: any) {
      Alert.alert('Attachment', errorMessage(error, 'Could not open that file.'));
    }
  }

  async function sendWithAttachment(note: string) {
    if (!attachment || busy) return;
    setVoice('understanding');
    setAttachOpen(false);
    setResult(null);
    setDraft('');
    setHistory((rows) => [...rows, { role: 'user', content: `${attachment.isVideo ? '🎬 Video' : '🖼️ Image'} · ${note}` }]);
    try {
      const media = await readBase64(attachment.uri);
      showResult(await interpretFromMedia({
        media,
        mimeType: attachment.mimeType,
        note,
        timezone: timezone(),
        calendarEvents: await calendarEvents(),
      }));
    } catch (error: any) {
      setVoice('error');
      Alert.alert('Attachment', errorMessage(error, 'Could not read that file.'));
    }
  }

  function toggleTask(index: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const tasks: ProposedTask[] = result?.tasks ?? [];
  const selectedCount = tasks.length - excluded.size;
  const canConfirm = selectedCount > 0 || Boolean(result?.arrivalReminders?.length);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <OrdinaMark size={36} />
          <ThemedText style={styles.headerText}>ORDINA AI</ThemedText>
        </View>
        <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
          {busy ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          <ThemedText style={[styles.pillText, { color: theme.primary }]}>{STATE_LABEL[voice]}</ThemedText>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {history.length === 0 ? (
            <View style={[styles.welcome, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={styles.proposalTitle}>Tell ORDINA what you need to get done today.</ThemedText>
              <ThemedText themeColor="textSecondary">
                Describe your day in your own words, for example “Study Python for two hours tomorrow morning and call
                my mentor at 6 PM”. ORDINA builds a plan you can edit before anything is saved.
              </ThemedText>
            </View>
          ) : null}

          {history.slice(-12).map((item, index) => {
            const mine = item.role === 'user';
            return (
              <View
                key={`${item.role}-${index}`}
                style={[mine ? styles.userBubble : styles.aiBubble, { backgroundColor: mine ? theme.primary : theme.card }]}>
                <ThemedText style={mine ? { color: theme.onPrimary } : undefined}>{item.content}</ThemedText>
              </View>
            );
          })}

          {result?.suggestedReplies?.length && !busy ? (
            <View style={styles.replies}>
              {result.suggestedReplies.map((reply: string) => (
                <Pressable
                  key={reply}
                  onPress={() => void (attachment ? send(reply) : sendLegacy(reply))}
                  style={({ pressed }) => [
                    styles.reply,
                    { borderColor: theme.primary, backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={[styles.replyText, { color: theme.primary }]}>{reply}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {busy ? (
            <View style={[styles.aiBubble, styles.typing, { backgroundColor: theme.card }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText themeColor="textSecondary">
                {planning ? 'ORDINA is planning your day…' : replanning ? 'Updating your plan…' : savingPlan ? 'Adding tasks…' : 'ORDINA is thinking…'}
              </ThemedText>
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

          {result?.plan ? (
            <View style={[styles.proposal, { backgroundColor: theme.card }]}>
              <ThemedText style={styles.proposalTitle}>A calmer plan</ThemedText>
              <ThemedText>Focus on: {(result.plan.highPriority || []).map((t: any) => t.title).join(', ') || 'Nothing urgent'}</ThemedText>
              <ThemedText themeColor="textSecondary">
                Can wait: {(result.plan.canWait || []).map((t: any) => t.title).join(', ') || 'None'}
              </ThemedText>
            </View>
          ) : null}

          {result?.recommendation ? (
            <View style={[styles.proposal, { backgroundColor: theme.card }]}>
              <ThemedText themeColor="textSecondary">Do this now</ThemedText>
              <ThemedText style={styles.proposalTitle}>{result.recommendation.title}</ThemedText>
            </View>
          ) : null}

          {result?.reschedule?.date && (result.reschedule.taskId || result.reschedule.titleHint) ? (
            <View style={[styles.proposal, { backgroundColor: theme.card }]}>
              <ThemedText style={styles.proposalTitle}>Proposed reschedule</ThemedText>
              <ThemedText>
                Move to {friendlyDate(result.reschedule.date)} {result.reschedule.startTime}
              </ThemedText>
              <PrimaryButton label={saving ? 'Saving…' : 'Confirm reschedule'} disabled={saving} onPress={() => void confirm()} />
            </View>
          ) : null}

          {result?.fixed?.length ? (
            <View style={[styles.proposal, { backgroundColor: theme.card }]}>
              <ThemedText style={styles.proposalTitle}>Already on your schedule</ThemedText>
              {result.fixed.map((item: { title: string; startTime: string; durationMinutes: number }) => (
                <View key={`${item.startTime}-${item.title}`} style={styles.fixedRow}>
                  <ThemedText themeColor="textSecondary" style={styles.fixedTime}>{item.startTime}</ThemedText>
                  <ThemedText style={{ flex: 1 }} numberOfLines={1}>{item.title}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          {(tasks.length > 0 || result?.arrivalReminders?.length) ? (
            <View style={[styles.proposal, { backgroundColor: theme.card }]}>
              <View>
                <ThemedText style={styles.proposalTitle}>Review before saving</ThemedText>
                {tasks.length > 1 ? (
                  <ThemedText themeColor="textSecondary" style={styles.hint}>Tap a task to leave it out.</ThemedText>
                ) : null}
              </View>
              {(result?.arrivalReminders || []).map((item: { title: string; placeName?: string }) => (
                <View key={`arrive-${item.title}`} style={styles.proposalItem}>
                  <View style={[styles.bar, { backgroundColor: theme.secondary }]} />
                  <View style={{ flex: 1 }}>
                    <ThemedText themeColor="textSecondary">When you arrive at {item.placeName}</ThemedText>
                    <ThemedText style={styles.itemTitle}>{item.title}</ThemedText>
                  </View>
                </View>
              ))}
              {tasks.map((item, index) => {
                const included = !excluded.has(index);
                return (
                  <Pressable
                    key={`${item.id ?? 'new'}-${item.title}-${index}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: included }}
                    onPress={() => toggleTask(index)}
                    style={[styles.proposalItem, { opacity: included ? 1 : 0.45 }]}>
                    <Ionicons
                      name={included ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={included ? theme.primary : theme.textSecondary}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText themeColor="textSecondary" style={styles.meta}>
                        {[friendlyDate(item.date), item.startTime, item.durationMinutes ? `${item.durationMinutes} min` : null]
                          .filter(Boolean)
                          .join(' · ')}
                        {item.id ? '  ·  moves existing task' : ''}
                      </ThemedText>
                      <ThemedText style={[styles.itemTitle, !included && styles.strike]}>{item.title}</ThemedText>
                      <View style={styles.tags}>
                        {item.reason ? (
                          <ThemedText style={[styles.tag, { backgroundColor: theme.backgroundSelected, color: theme.primary }]}>
                            {item.reason}
                          </ThemedText>
                        ) : null}
                        {item.priority === 'high' ? (
                          <ThemedText style={[styles.tag, { backgroundColor: theme.backgroundSelected, color: theme.danger }]}>
                            High priority
                          </ThemedText>
                        ) : null}
                        {item.contactName ? (
                          <ThemedText style={[styles.tag, { backgroundColor: theme.backgroundSelected, color: theme.text }]}>
                            {item.contactPhone ? '📞 ' : '👤 '}
                            {item.contactName}
                          </ThemedText>
                        ) : null}
                      </View>
                      {item.conflictsWith?.length ? (
                        <ThemedText style={{ color: theme.warning, fontSize: 12 }}>
                          Moved to {item.startTime} to avoid {item.conflictsWith.join(', ')}.
                        </ThemedText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label={saving ? 'Saving…' : tasks.length ? `Confirm ${selectedCount} & save` : 'Confirm & save'}
                    disabled={!canConfirm || saving}
                    onPress={() => void confirm()}
                  />
                </View>
                <Pressable
                  onPress={() => {
                    setResult(null);
                    setVoice('ready');
                  }}
                  style={[styles.edit, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText>Discard</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {aiError || isOffline ? (
          // Calm, friendly colours: being offline is normal and nothing is broken.
          <View accessibilityRole="alert" style={[styles.errorBar, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name={NOTICE_ICON[aiError?.kind ?? 'offline']} size={20} color={theme.primary} />
            <View style={styles.noticeCopy}>
              <ThemedText style={styles.noticeTitle}>
                {t(`ai.${aiError?.kind === 'problem' ? 'problemTitle' : `${aiError?.kind ?? 'offline'}Title`}`)}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.errorText}>
                {aiError?.kind === 'problem' ? aiError.message : t(`ai.${aiError?.kind ?? 'offline'}Body`)}
              </ThemedText>
            </View>
            {aiError?.retry ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={aiError.retry} style={styles.errorAction}>
                <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('common.tryAgain')}</ThemedText>
              </Pressable>
            ) : null}
            {aiError ? <Pressable accessibilityRole="button" accessibilityLabel={t('common.dismiss')} onPress={() => setAiError(null)} style={styles.errorAction}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </Pressable> : null}
          </View>
        ) : null}

        {keyboardOpen || attachment || !FEATURES.aiQuickActions ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quick}>
          {QUICK_PROMPTS.map((label) => (
            <Pressable
              key={label}
              disabled={busy}
              onPress={() => void sendLegacy(label)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <ThemedText style={styles.chipText}>{label}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
        )}

        {attachOpen ? (
          <View style={[styles.attachMenu, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {([
              { source: 'camera-photo', icon: 'camera-outline', label: 'Photo' },
              { source: 'camera-video', icon: 'videocam-outline', label: 'Video' },
              { source: 'library', icon: 'images-outline', label: 'Gallery' },
            ] as const).map((item) => (
              <Pressable key={item.source} onPress={() => void attach(item.source)} style={styles.attachOption}>
                <View style={[styles.attachIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons name={item.icon} size={20} color={theme.primary} />
                </View>
                <ThemedText style={styles.chipText}>{item.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {attachment ? (
          <View style={[styles.attachmentBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {attachment.isVideo ? (
              <View style={[styles.thumb, styles.videoThumb, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="videocam" size={20} color={theme.primary} />
              </View>
            ) : (
              <Image source={{ uri: attachment.uri }} style={styles.thumb} contentFit="cover" />
            )}
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.attachmentTitle}>{attachment.isVideo ? 'Video attached' : 'Photo attached'}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.attachmentHint}>
                Tell ORDINA what to do with it, then send.
              </ThemedText>
            </View>
            <Pressable accessibilityLabel="Remove attachment" hitSlop={8} onPress={() => setAttachment(null)}>
              <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.composer,
            { backgroundColor: theme.card, borderColor: theme.border, marginBottom: keyboardOpen ? 8 : 16 },
          ]}>
          {FEATURES.mediaToTasks && Platform.OS !== 'web' ? (
            <Pressable
              accessibilityLabel="Attach photo or video"
              disabled={busy}
              onPress={() => setAttachOpen((open) => !open)}
              style={[styles.mic, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name={attachOpen ? 'close' : 'add'} size={20} color={theme.text} />
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={voice === 'listening'
              ? 'Listening… tap stop when done'
              : attachment
                ? 'e.g. “Create tasks from this list”'
                : 'Tell ORDINA what you need to get done today.'}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            onFocus={() => setAttachOpen(false)}
            editable={!planning}
            accessibilityLabel="Tell ORDINA what you need to get done today"
            maxLength={2000}
            style={[styles.input, { color: theme.text }]}
          />
          {Platform.OS === 'web' ? null : (
            <Pressable
              accessibilityLabel={voice === 'listening' ? 'Stop recording' : 'Speak your request'}
              disabled={busy && voice !== 'listening'}
              onPress={() => void toggleVoice()}
              style={[styles.mic, { backgroundColor: voice === 'listening' ? theme.danger : theme.secondary }]}>
              <Ionicons name={voice === 'listening' ? 'stop' : 'mic'} size={18} color="#FFFFFF" />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Send"
            disabled={busy || !draft.trim()}
            onPress={() => void send(draft)}
            style={[styles.mic, { backgroundColor: theme.primary, opacity: busy || !draft.trim() ? 0.5 : 1 }]}>
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  chat: { padding: 16, gap: 12, paddingBottom: 24 },
  welcome: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
  aiBubble: { alignSelf: 'flex-start', maxWidth: '90%', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  proposal: { borderRadius: 16, padding: 16, gap: 12 },
  proposalTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  hint: { fontSize: 12 },
  proposalItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bar: { width: 4, height: 40, borderRadius: 2 },
  meta: { fontSize: 12 },
  itemTitle: { fontFamily: 'Poppins_500Medium' },
  strike: { textDecorationLine: 'line-through' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: 11, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  fixedRow: { flexDirection: 'row', gap: 10 },
  fixedTime: { width: 48 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  edit: { borderRadius: Radii.full, paddingHorizontal: 18, paddingVertical: 16 },
  quickRow: { flexGrow: 0 },
  replies: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reply: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  replyText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  attachmentTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  attachmentHint: { fontSize: 11 },
  quick: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12 },
  attachMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
  },
  attachOption: { alignItems: 'center', gap: 4 },
  attachIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 26,
    borderWidth: 1,
    padding: 6,
    gap: 6,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 15, paddingVertical: 10, paddingHorizontal: 6, minHeight: 40, maxHeight: 120 },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  errorText: { fontSize: 13, lineHeight: 18 },
  noticeCopy: { flex: 1, paddingVertical: 10, gap: 2 },
  noticeTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  errorAction: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
});
