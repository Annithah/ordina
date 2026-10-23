import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryBadge } from '@/components/category-ui';
import { OrdinaMark } from '@/components/ordina-mark';
import { PlanReview } from '@/components/plan-review';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radii } from '@/constants/theme';
import { MAX_FILES, checkAttachment, detectFile, formatBytes, headBytes, type AttachmentKind, type DetectedFile } from '@/features/attachments';
import { contextWindow, conversationTitle } from '@/features/chat-groups';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { aiNoticeKind, isOnline, type AiNoticeKind } from '@/services/connectivity';
import { confirmAiActions, confirmPlan, interpretFromFiles, interpretInstruction, requestPlan, transcribeAudio } from '@/services/ai';
import { friendlyAiMessage, isFileProblem } from '@/services/ai/errors';
import {
  appendMessages,
  createConversation,
  getConversation,
  keepAttachment,
  loadConversation,
  newMessage,
  updatePlanStatus,
  type ChatAttachment,
  type ChatMessage,
  type PlanMeta,
} from '@/services/chat-history';
import {
  cameraPermission,
  cameraPermissionStatus,
  compressForUpload,
  matchingContacts,
  pickDocuments,
  pickPhotos,
  takePhoto,
  type PickedFile,
} from '@/services/device-integrations';
import {
  createGoogleCalendarEvents,
  getGoogleCalendarBusyEvents,
  getGoogleCalendarConnection,
} from '@/services/google-calendar';
import { setTaskReminder } from '@/services/local-tasks';
import { getSettings } from '@/services/notifications';
import { announceTasksAdded } from '@/services/task-feedback';
import { useAuthStore } from '@/store/auth-store';
import { useCategoriesStore } from '@/store/categories-store';
import { useTasksStore } from '@/store/tasks-store';
import type { DraftTask, Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';
import { href } from '@/utils/href';
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

type ProposedTask = {
  id?: string;
  title: string;
  description?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  priority?: string;
  category?: string;
  reminder?: boolean;
  reason?: string;
  contactName?: string;
  contactPhone?: string;
  conflictsWith?: string[];
  suggestedStartTime?: string;
};

/** A file chosen in the composer, checked and waiting to be sent. */
type PendingFile = PickedFile & { key: string; detected: DetectedFile };

const QUICK_PROMPTS = ['Plan my day', 'What should I do now?', "I'm overwhelmed", 'Plan my week'];

const KIND_ICON: Record<AttachmentKind, keyof typeof Ionicons.glyphMap> = {
  image: 'image-outline',
  video: 'videocam-outline',
  pdf: 'document-text-outline',
  docx: 'document-outline',
  text: 'reader-outline',
};

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
  const friendly = friendlyAiMessage(error);
  if (friendly) return friendly;
  const message: string = error?.response?.data?.message || '';
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message ?? '')) {
    return 'ORDINA AI took too long to answer. Try a shorter clip or check your connection.';
  }
  if (/Network Error/i.test(error?.message ?? '')) {
    return 'ORDINA AI could not be reached. Check your internet connection and try again.';
  }
  return message || fallback;
}

/** ORDINA AI errors get a friendly message; everything else gets a plain explanation. */
function aiErrorMessage(error: any, fallback: string) {
  const friendly = friendlyAiMessage(error);
  if (friendly) return friendly;
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

/** The first bytes of a file, to check what it really is before it is attached. */
async function readHead(uri: string): Promise<Uint8Array> {
  try {
    const handle = new File(uri).open();
    try {
      return handle.readBytes(64);
    } finally {
      handle.close();
    }
  } catch {
    // Some content:// files cannot be opened for reading by bytes; fall back to base64.
    return headBytes((await readBase64(uri)).slice(0, 128));
  }
}

function fileExists(uri: string) {
  try {
    return new File(uri).exists;
  } catch {
    return false;
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
  const params = useLocalSearchParams<{ conversation?: string }>();
  const network = useNetworkState();
  const isOffline = network.isConnected === false || network.isInternetReachable === false;
  const ordinaUserId = useAuthStore((state) => state.user?.id);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const learnCategory = useCategoriesStore((s) => s.learn);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState('');
  // The open chat. Saved on the phone as soon as the first message is sent.
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const conversationRef = useRef<Promise<string> | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [result, setResult] = useState<any>(null);
  const [resultMessageId, setResultMessageId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [voice, setVoice] = useState<VoiceState>('ready');
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // Files wait here (checked, max 5) until the user sends them, with or without text.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewer, setViewer] = useState<ChatAttachment | null>(null);
  const [cameraAsk, setCameraAsk] = useState<'explain' | 'blocked' | null>(null);
  const [saving, setSaving] = useState(false);
  // ORDINA AI plan (typed requests): review before anything is saved.
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planMessageId, setPlanMessageId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answered, setAnswered] = useState<{ question: string; answer: string }[]>([]);
  const [planRequest, setPlanRequest] = useState('');
  const [planning, setPlanning] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [aiError, setAiError] = useState<AiNotice | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Explains a failed AI request calmly: offline, AI not reachable, slow, or what went wrong. The text and files stay. */
  async function showNotice(error: unknown, fallback: string, retry: () => void) {
    const kind: AiNoticeKind = (await isOnline()) ? aiNoticeKind(error) : 'offline';
    const message = kind === 'problem' ? aiErrorMessage(error, fallback) : kind === 'offline' ? t('ai.offlineSend') : undefined;
    setAiError({ kind, message, retry });
  }

  /** No internet: say so before sending anything; the user's text and files stay where they are. */
  async function stopIfOffline(retry: () => void) {
    if (await isOnline()) return false;
    setAiError({ kind: 'offline', message: t('ai.offlineSend'), retry });
    return true;
  }

  const busy = voice === 'understanding' || voice === 'processing' || saving || planning || replanning || savingPlan || uploadProgress !== null;

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

  /** Starts an empty chat; nothing is stored until the first message. */
  function resetChat() {
    conversationRef.current = null;
    messagesRef.current = [];
    setChatTitle(null);
    setMessages([]);
    setPlan(null);
    setPlanMessageId(null);
    setDrafts([]);
    setResult(null);
    setResultMessageId(null);
    setAiError(null);
    setVoice('ready');
  }

  // History screen -> /ai?conversation=<id> (or "new").
  useEffect(() => {
    const id = params.conversation;
    if (!id) return;
    let alive = true;
    if (id === 'new') {
      void Promise.resolve().then(() => alive && resetChat());
      return () => {
        alive = false;
      };
    }
    void Promise.resolve().then(() => alive && setLoadingChat(true));
    void Promise.all([getConversation(id), loadConversation(id)])
      .then(([row, loaded]) => {
        if (!alive) return;
        resetChat();
        if (!row) return;
        conversationRef.current = Promise.resolve(id);
        messagesRef.current = loaded;
        setChatTitle(row.title);
        setMessages(loaded);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
      })
      .catch(() => toast.error(t('chats.failed')))
      .finally(() => alive && setLoadingChat(false));
    return () => {
      alive = false;
    };
  }, [params.conversation]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Shows messages now and saves them in the open chat (created on the first message). */
  function addMessages(...items: ChatMessage[]) {
    setMessages((rows) => {
      const ids = new Set(items.map((item) => item.id));
      return [...rows.filter((row) => !ids.has(row.id)), ...items];
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    if (!conversationRef.current) {
      const first = items.find((item) => item.role === 'user') ?? items[0];
      const title = first.content || first.attachments.map((file) => file.name).join(', ');
      conversationRef.current = createConversation(title);
      setChatTitle(conversationTitle(title));
    }
    void conversationRef.current.then((id) => appendMessages(id, items)).catch(() => undefined);
  }

  /** A task preview card was added or cancelled: its card says so, also in the saved chat. */
  function setPlanStatus(messageId: string | null, update: Partial<PlanMeta>) {
    const current = messagesRef.current.find((row) => row.id === messageId);
    if (!messageId || !current?.plan) return;
    const next: PlanMeta = { ...current.plan, ...update };
    setMessages((rows) => rows.map((row) => (row.id === messageId ? { ...row, plan: next } : row)));
    void updatePlanStatus(messageId, next).catch(() => undefined);
  }

  /** The open chat's last messages, so ORDINA understands "move it to Friday". */
  const chatContext = () => contextWindow(messagesRef.current);

  function showResult(data: any, userMessage?: ChatMessage) {
    setResult(data);
    setExcluded(new Set());
    const proposed: ProposedTask[] = data.tasks ?? [];
    const reply = data.message || 'Here is what I understood.';
    const assistant = proposed.length
      ? newMessage('assistant', reply, { plan: { status: 'pending', titles: proposed.map((task) => task.title), count: proposed.length } })
      : newMessage('assistant', reply);
    setResultMessageId(proposed.length ? assistant.id : null);
    addMessages(...(userMessage ? [userMessage] : []), assistant);
    setVoice(proposed.length || data.reschedule || data.arrivalReminders?.length ? 'confirmation' : 'completed');
  }

  async function calendarEvents() {
    if (!ordinaUserId || !FEATURES.googleCalendar) return [];
    return getGoogleCalendarBusyEvents(ordinaUserId).catch(() => []);
  }

  /** Typed request: ask ORDINA for a plan. The text stays in the box until a plan arrives. */
  async function send(text: string) {
    const message = text.trim();
    if (busy) return;
    if (pending.length) {
      await sendFiles(message);
      return;
    }
    if (!message) return;
    setAiError(null);
    if (await stopIfOffline(() => void send(message))) return;
    setAttachOpen(false);
    setResult(null);
    setPlanning(true);
    setVoice('understanding');
    if (plan && planMessageId) setPlanStatus(planMessageId, { status: 'cancelled' });
    try {
      const next = await requestPlan({ message, conversation: chatContext() });
      const nextDrafts = toDrafts(next.tasks);
      const card = newMessage('assistant', next.summary, {
        plan: { status: 'pending', titles: nextDrafts.map((task) => task.title), count: nextDrafts.length },
      });
      setPlan(next);
      setPlanMessageId(nextDrafts.length ? card.id : null);
      setDrafts(nextDrafts);
      setAnswers({});
      setAnswered([]);
      setPlanRequest(message);
      addMessages(newMessage('user', message), nextDrafts.length ? card : newMessage('assistant', next.summary));
      setDraft('');
      setVoice(next.tasks.length || next.questions.length ? 'confirmation' : 'completed');
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
      const next = await requestPlan({ message: planRequest, answers: allAnswers, keepTasks: toKeepTasks(drafts), conversation: chatContext() });
      const merged = mergeReplan(drafts, next.tasks);
      setPlan(next);
      setDrafts(merged);
      setAnswers({});
      setAnswered(allAnswers);
      // The plan card shows the updated plan.
      const card = newMessage('assistant', next.summary, { plan: { status: 'pending', titles: merged.map((task) => task.title), count: merged.length } });
      if (planMessageId) setPlanStatus(planMessageId, { status: 'cancelled' });
      setPlanMessageId(merged.length ? card.id : null);
      addMessages(newMessage('user', newAnswers.map((item) => item.answer).join(' · ')), card);
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
      for (const task of drafts) {
        if (task.suggestedCategory && task.category !== task.suggestedCategory) void learnCategory(task.title, task.suggestedCategory, task.category);
      }
      const saved = await confirmPlan(plan.planId, toConfirmPayload(drafts));
      await loadTasks();
      const count = saved.created.length;
      void announceTasksAdded(saved.created.map((task) => ({ id: task.id, dueDate: (task as { dueDate?: string }).dueDate })), { undo: false });
      setPlanStatus(planMessageId, { status: 'added', added: count });
      setPlan(null);
      setPlanMessageId(null);
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
    setPlanStatus(planMessageId, { status: 'cancelled' });
    setPlan(null);
    setPlanMessageId(null);
    setDrafts([]);
    setAnswers({});
    setAnswered([]);
    setAiError(null);
    setVoice('ready');
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
    const userMessage = newMessage('user', message);
    setDraft('');
    try {
      const [contacts, events] = await Promise.all([
        FEATURES.contacts ? matchingContacts(message).catch(() => []) : Promise.resolve([]),
        calendarEvents(),
      ]);
      showResult(await interpretInstruction({ message, timezone: timezone(), contacts, calendarEvents: events, conversation: chatContext() }), userMessage);
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
      // Tasks ORDINA proposed with a reminder get the user's default reminder (Settings).
      if (FEATURES.taskReminders) {
        const { defaultLead } = await getSettings().catch(() => ({ defaultLead: 15 }));
        for (const task of [...(saved.created ?? []), ...(saved.rescheduled ?? [])]) {
          if (task.reminder && task.dueDate) await setTaskReminder(String(task.id), defaultLead).catch(() => undefined);
        }
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
      void announceTasksAdded((saved.created ?? []).map((task) => ({ id: String(task.id), dueDate: task.dueDate })), { undo: false });
      const count = (saved.created ?? []).length + (saved.rescheduled ?? []).length;
      setPlanStatus(resultMessageId, { status: 'added', added: count });
      setVoice('completed');
      setResult(null);
      setResultMessageId(null);
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

  function discardResult() {
    setPlanStatus(resultMessageId, { status: 'cancelled' });
    setResult(null);
    setResultMessageId(null);
    setVoice('ready');
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

  /** Checks picked files (type by content, size, count) and adds the good ones to the composer. */
  async function addFiles(files: PickedFile[]) {
    const accepted: PendingFile[] = [];
    let count = pending.length;
    for (const file of files) {
      const detected = detectFile(await readHead(file.uri), file.name);
      const problem = checkAttachment({ size: file.size || fileSize(file.uri), detected }, count);
      if (problem) {
        toast.error(problem === 'tooMany'
          ? t('ai.tooMany', { n: MAX_FILES })
          : t(`ai.${problem}`, { name: file.name }));
        if (problem === 'tooMany') break;
        continue;
      }
      accepted.push({ ...file, key: `${file.uri}-${count}`, detected: detected! });
      count += 1;
    }
    if (accepted.length) {
      setPending((current) => [...current, ...accepted]);
      setAiError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }

  async function openCamera() {
    const status = await cameraPermissionStatus().catch(() => 'undetermined');
    if (status !== 'granted') {
      // Explain first; the system question comes after "Continue".
      setCameraAsk(status === 'denied' ? 'blocked' : 'explain');
      return;
    }
    await addFiles(await takePhoto());
  }

  async function attach(source: 'camera' | 'photos' | 'files') {
    setAttachOpen(false);
    const room = MAX_FILES - pending.length;
    if (room <= 0) {
      toast.error(t('ai.tooMany', { n: MAX_FILES }));
      return;
    }
    try {
      if (source === 'camera') await openCamera();
      else await addFiles(source === 'photos' ? await pickPhotos(room) : await pickDocuments(room));
    } catch (error: any) {
      toast.error(errorMessage(error, t('ai.openFailed')));
    }
  }

  async function sendFiles(note: string) {
    if (!pending.length || busy) return;
    const files = pending;
    setAiError(null);
    // Offline: the files stay attached so the user can send them later.
    if (await stopIfOffline(() => void sendFiles(note))) return;
    setAttachOpen(false);
    setResult(null);
    setVoice('understanding');
    setUploadProgress(0);
    try {
      const prepared = await Promise.all(files.map(async (file) => {
        const ready = await compressForUpload(file);
        return { file: ready, data: await readBase64(ready.uri) };
      }));
      const response = await interpretFromFiles({
        files: prepared.map(({ file, data }) => ({ data, mimeType: file.mimeType, name: file.name })),
        note,
        timezone: timezone(),
        calendarEvents: await calendarEvents(),
        conversation: chatContext(),
      }, setUploadProgress);
      const kept = await Promise.all(prepared.map(({ file }, index) => keepAttachment({
        kind: files[index].detected.kind,
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      })));
      setPending([]);
      setDraft('');
      showResult(response, newMessage('user', note, { attachments: kept }));
    } catch (error: any) {
      setVoice('error');
      const code = error?.response?.data?.code;
      // Too large / unsupported / unreadable: say which file; anything else can be retried.
      if (isFileProblem(error) || (code && String(code).startsWith('FILE'))) {
        setAiError({ kind: 'problem', message: aiErrorMessage(error, t('ai.unreadableGeneric')) });
      } else {
        await showNotice(error, t('ai.uploadFailed'), () => void sendFiles(note));
      }
    } finally {
      setUploadProgress(null);
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
  const canSend = !busy && (Boolean(draft.trim()) || pending.length > 0);

  function planLabel(meta: PlanMeta) {
    if (meta.status === 'added') return meta.added === 1 ? t('chats.planAddedOne') : t('chats.planAdded', { n: meta.added ?? meta.count });
    if (meta.status === 'cancelled') return t('chats.planCancelled');
    return t('chats.planPending');
  }

  function renderAttachment(file: ChatAttachment, mine: boolean) {
    const tint = mine ? theme.onPrimary : theme.text;
    if (file.kind === 'image' && fileExists(file.uri)) {
      return (
        <Pressable key={file.uri} accessibilityRole="imagebutton" accessibilityLabel={`${t('ai.viewFile')} ${file.name}`} onPress={() => setViewer(file)}>
          <Image source={{ uri: file.uri }} style={styles.bubbleImage} contentFit="cover" />
        </Pressable>
      );
    }
    return (
      <Pressable
        key={file.uri}
        accessibilityRole="button"
        accessibilityLabel={`${t('ai.viewFile')} ${file.name}`}
        onPress={() => setViewer(file)}
        style={[styles.fileCard, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : theme.backgroundElement }]}>
        <Ionicons name={KIND_ICON[file.kind]} size={20} color={tint} />
        <View style={{ flexShrink: 1 }}>
          <ThemedText style={[styles.fileName, { color: tint }]} numberOfLines={1}>{file.name}</ThemedText>
          <ThemedText style={[styles.fileMeta, { color: tint, opacity: 0.75 }]}>{formatBytes(file.size)}</ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <OrdinaMark size={32} />
          <View style={{ flexShrink: 1 }}>
            <ThemedText style={styles.headerText}>ORDINA AI</ThemedText>
            {chatTitle ? <ThemedText themeColor="textSecondary" style={styles.headerSub} numberOfLines={1}>{chatTitle}</ThemedText> : null}
          </View>
          {busy ? <ActivityIndicator size="small" color={theme.primary} accessibilityLabel={STATE_LABEL[voice]} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chats.new')}
          onPress={() => {
            if (!busy) resetChat();
          }}
          style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="create-outline" size={19} color={theme.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chats.history')}
          onPress={() => router.push(href('/ai-history'))}
          style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="time-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {loadingChat ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
          {messages.length === 0 && !loadingChat ? (
            <View style={[styles.welcome, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={styles.proposalTitle}>Tell ORDINA what you need to get done today.</ThemedText>
              <ThemedText themeColor="textSecondary">
                Describe your day in your own words, for example “Study Python for two hours tomorrow morning and call
                my mentor at 6 PM”. ORDINA builds a plan you can edit before anything is saved.
              </ThemedText>
              <View style={styles.welcomeHint}>
                <Ionicons name="attach" size={16} color={theme.primary} />
                <ThemedText themeColor="textSecondary" style={styles.hint}>{t('ai.welcomeAttach')}</ThemedText>
              </View>
            </View>
          ) : null}

          {messages.map((item) => {
            const mine = item.role === 'user';
            return (
              <View key={item.id} style={[mine ? styles.userBubble : styles.aiBubble, { backgroundColor: mine ? theme.primary : theme.card }]}>
                {item.attachments.length ? (
                  <View style={styles.bubbleFiles}>{item.attachments.map((file) => renderAttachment(file, mine))}</View>
                ) : null}
                {item.content ? <ThemedText style={mine ? { color: theme.onPrimary } : undefined}>{item.content}</ThemedText> : null}
                {item.plan ? (
                  <View style={[styles.planCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <View style={styles.planHead}>
                      <Ionicons
                        name={item.plan.status === 'added' ? 'checkmark-circle' : item.plan.status === 'cancelled' ? 'close-circle-outline' : 'list-outline'}
                        size={18}
                        color={item.plan.status === 'added' ? theme.success : item.plan.status === 'cancelled' ? theme.textSecondary : theme.primary}
                      />
                      <ThemedText style={styles.planStatus}>{planLabel(item.plan)}</ThemedText>
                    </View>
                    {item.plan.titles.slice(0, 5).map((title, index) => (
                      <ThemedText key={`${title}-${index}`} themeColor="textSecondary" style={styles.planTitle} numberOfLines={1}>• {title}</ThemedText>
                    ))}
                    {item.plan.titles.length > 5 ? (
                      <ThemedText themeColor="textSecondary" style={styles.planTitle}>+{item.plan.titles.length - 5}</ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {result?.suggestedReplies?.length && !busy ? (
            <View style={styles.replies}>
              {result.suggestedReplies.map((reply: string) => (
                <Pressable
                  key={reply}
                  onPress={() => void sendLegacy(reply)}
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
                {uploadProgress !== null
                  ? uploadProgress < 1 ? t('ai.uploading', { percent: Math.round(uploadProgress * 100) }) : t('ai.reading')
                  : planning ? 'ORDINA is planning your day…' : replanning ? 'Updating your plan…' : savingPlan ? 'Adding tasks…' : 'ORDINA is thinking…'}
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
              <ThemedText>Focus on: {(result.plan.highPriority || []).map((item: any) => item.title).join(', ') || 'Nothing urgent'}</ThemedText>
              <ThemedText themeColor="textSecondary">
                Can wait: {(result.plan.canWait || []).map((item: any) => item.title).join(', ') || 'None'}
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
                const category = item.category ?? useCategoriesStore.getState().suggest(`${item.title} ${item.description ?? ''}`);
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
                        {category ? <CategoryBadge id={category} compact /> : null}
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
                <Pressable onPress={discardResult} style={[styles.edit, { backgroundColor: theme.backgroundElement }]}>
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
                {aiError?.message ?? (pending.length ? t('ai.offlineSend') : t(`ai.${aiError?.kind ?? 'offline'}Body`))}
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

        {keyboardOpen || pending.length || !FEATURES.aiQuickActions ? null : (
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
            <View style={styles.attachOptions}>
              {([
                { source: 'camera', icon: 'camera-outline', label: t('ai.camera') },
                { source: 'photos', icon: 'images-outline', label: t('ai.photos') },
                { source: 'files', icon: 'document-attach-outline', label: t('ai.files') },
              ] as const).map((item) => (
                <Pressable key={item.source} accessibilityRole="button" onPress={() => void attach(item.source)} style={styles.attachOption}>
                  <View style={[styles.attachIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={item.icon} size={22} color={theme.primary} />
                  </View>
                  <ThemedText style={styles.chipText}>{item.label}</ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText themeColor="textSecondary" style={styles.attachHint}>{t('ai.attachHint', { n: MAX_FILES })}</ThemedText>
          </View>
        ) : null}

        {pending.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow} keyboardShouldPersistTaps="handled">
            {pending.map((file) => (
              <View key={file.key} style={[styles.pendingChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {file.detected.kind === 'image' ? (
                  <Image source={{ uri: file.uri }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.docThumb, { backgroundColor: theme.backgroundSelected }]}>
                    <Ionicons name={KIND_ICON[file.detected.kind]} size={20} color={theme.primary} />
                  </View>
                )}
                <View style={styles.pendingText}>
                  <ThemedText style={styles.pendingName} numberOfLines={1}>{file.name}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.pendingMeta}>{formatBytes(file.size)}</ThemedText>
                </View>
                {uploadProgress !== null ? (
                  <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
                    <View style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%`, backgroundColor: theme.primary }]} />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('ai.remove', { name: file.name })}
                    hitSlop={8}
                    onPress={() => setPending((current) => current.filter((item) => item.key !== file.key))}>
                    <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View
          style={[
            styles.composer,
            { backgroundColor: theme.card, borderColor: theme.border, marginBottom: keyboardOpen ? 8 : 16 },
          ]}>
          {FEATURES.mediaToTasks && Platform.OS !== 'web' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ai.attach')}
              accessibilityState={{ expanded: attachOpen }}
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                setAttachOpen((open) => !open);
              }}
              style={[styles.mic, { backgroundColor: attachOpen ? theme.primary : theme.backgroundSelected }]}>
              <Ionicons name={attachOpen ? 'close' : 'attach'} size={22} color={attachOpen ? '#FFFFFF' : theme.primary} />
              {pending.length ? (
                <View style={[styles.attachCount, { backgroundColor: theme.primary, borderColor: theme.card }]}>
                  <ThemedText style={styles.attachCountText}>{pending.length}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={voice === 'listening'
              ? 'Listening… tap stop when done'
              : pending.length
                ? t('ai.filesPlaceholder')
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
            disabled={!canSend}
            onPress={() => void send(draft)}
            style={[styles.mic, { backgroundColor: theme.primary, opacity: canSend ? 1 : 0.5 }]}>
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen view of an attachment */}
      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setViewer(null)} style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          {viewer?.kind === 'image' && fileExists(viewer.uri) ? (
            <Image source={{ uri: viewer.uri }} style={styles.viewerImage} contentFit="contain" />
          ) : viewer ? (
            <View style={[styles.viewerFile, { backgroundColor: theme.card }]}>
              <Ionicons name={KIND_ICON[viewer.kind]} size={44} color={theme.primary} />
              <ThemedText style={styles.viewerName}>{viewer.name}</ThemedText>
              <ThemedText themeColor="textSecondary">{formatBytes(viewer.size)}</ThemedText>
              {!fileExists(viewer.uri) ? <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('ai.fileGone')}</ThemedText> : null}
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Camera: explain before the system question; if refused, show how to turn it on */}
      <Modal visible={Boolean(cameraAsk)} transparent animationType="fade" onRequestClose={() => setCameraAsk(null)}>
        <Pressable style={styles.askBackdrop} onPress={() => setCameraAsk(null)}>
          <Pressable style={[styles.askCard, { backgroundColor: theme.card }]}>
            <Ionicons name="camera-outline" size={30} color={theme.primary} />
            <ThemedText style={styles.proposalTitle}>{t('ai.cameraWhyTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {cameraAsk === 'blocked' ? t('ai.cameraBlocked') : t('ai.cameraWhy')}
            </ThemedText>
            <PrimaryButton
              label={cameraAsk === 'blocked' ? t('ai.openSettings') : t('ai.allow')}
              onPress={() => {
                const mode = cameraAsk;
                setCameraAsk(null);
                if (mode === 'blocked') {
                  void Linking.openSettings();
                  return;
                }
                void cameraPermission().then(async (answer) => {
                  if (answer === 'granted') await addFiles(await takePhoto());
                  else if (answer === 'blocked') setCameraAsk('blocked');
                }).catch(() => toast.error(t('ai.openFailed')));
              }}
            />
            <Pressable accessibilityRole="button" onPress={() => setCameraAsk(null)} style={styles.askLater}>
              <ThemedText style={{ fontFamily: 'Poppins_600SemiBold' }}>{t('ai.notNow')}</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  headerSub: { fontSize: 11 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chat: { padding: 16, gap: 12, paddingBottom: 24 },
  welcome: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  welcomeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 18, borderBottomRightRadius: 4, padding: 12, gap: 8 },
  aiBubble: { alignSelf: 'flex-start', maxWidth: '90%', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, gap: 8 },
  bubbleFiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bubbleImage: { width: 140, height: 140, borderRadius: 12 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 220 },
  fileName: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  fileMeta: { fontSize: 11 },
  planCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  planStatus: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  planTitle: { fontSize: 12 },
  proposal: { borderRadius: 16, padding: 16, gap: 12 },
  proposalTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, textAlign: 'left' },
  hint: { fontSize: 12, flexShrink: 1 },
  proposalItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bar: { width: 4, height: 40, borderRadius: 2 },
  meta: { fontSize: 12 },
  itemTitle: { fontFamily: 'Poppins_500Medium' },
  strike: { textDecorationLine: 'line-through' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
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
  pendingRow: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  pendingChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 6, paddingRight: 10, width: 210 },
  pendingText: { flex: 1 },
  pendingName: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  pendingMeta: { fontSize: 11 },
  progressTrack: { width: 36, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  docThumb: { alignItems: 'center', justifyContent: 'center' },
  quick: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12 },
  attachMenu: { marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 18, paddingVertical: 12, gap: 8 },
  attachOptions: { flexDirection: 'row', justifyContent: 'space-around' },
  attachOption: { alignItems: 'center', gap: 4, minWidth: 72, minHeight: 44 },
  attachIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  attachHint: { fontSize: 11, textAlign: 'center' },
  attachCount: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  attachCountText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Poppins_700Bold' },
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
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  viewerClose: { position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 2 },
  viewerImage: { width: '100%', height: '80%' },
  viewerFile: { alignItems: 'center', gap: 8, borderRadius: 20, padding: 28, maxWidth: 320 },
  viewerName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  askBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 },
  askCard: { borderRadius: 20, padding: 20, gap: 12, alignItems: 'center' },
  askLater: { minHeight: 44, justifyContent: 'center' },
});
