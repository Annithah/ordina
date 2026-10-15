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

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAiActions, fetchAiMessages, interpretFromMedia, interpretInstruction, transcribeAudio } from '@/services/ai';
import { MAX_MEDIA_BYTES, matchingContacts, pickTaskMedia, type MediaSource } from '@/services/device-integrations';
import {
  createGoogleCalendarEvents,
  getGoogleCalendarBusyEvents,
  getGoogleCalendarConnection,
} from '@/services/google-calendar';
import { scheduleTaskReminder } from '@/services/notifications';
import { useAuthStore } from '@/store/auth-store';
import { useTasksStore } from '@/store/tasks-store';

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

export default function OrdinaAiScreen() {
  const theme = useTheme();
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

  const busy = voice === 'understanding' || voice === 'processing' || saving;

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
    if (!ordinaUserId) return [];
    return getGoogleCalendarBusyEvents(ordinaUserId).catch(() => []);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    if (attachment) {
      await sendWithAttachment(message);
      return;
    }
    setVoice('understanding');
    setAttachOpen(false);
    setResult(null);
    setHistory((rows) => [...rows, { role: 'user', content: message }]);
    setDraft('');
    try {
      const [contacts, events] = await Promise.all([
        matchingContacts(message).catch(() => []),
        calendarEvents(),
      ]);
      showResult(await interpretInstruction({ message, timezone: timezone(), contacts, calendarEvents: events }));
    } catch (error: any) {
      setVoice('error');
      Alert.alert('ORDINA AI', errorMessage(error, 'Unable to reach ORDINA AI.'));
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
      for (const task of [...(saved.created ?? []), ...(saved.rescheduled ?? [])]) {
        if (!task.reminder || !task.dueDate) continue;
        try {
          const start = new Date(`${task.dueDate}T${task.startTime || '09:00'}:00`);
          const when = task.startTime ? new Date(start.getTime() - REMINDER_LEAD_MINUTES * 60_000) : start;
          await scheduleTaskReminder(String(task.id), task.title, when.getTime() > Date.now() ? when : start, {
            body: task.startTime
              ? `Starts at ${task.startTime}${task.contactName ? ` · ${task.contactName}` : ''}`
              : 'Planned for today',
          });
        } catch (error) {
          followUpErrors.push(error instanceof Error ? error.message : 'A task reminder could not be scheduled.');
        }
      }
      // Only new tasks become calendar events; moved tasks would otherwise be duplicated.
      const newTasks = chosen.filter((task) => !task.id);
      if (newTasks.length && ordinaUserId && await getGoogleCalendarConnection(ordinaUserId).catch(() => null)) {
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
        setVoice('ready');
        await send(text);
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
          <Image source={require('@/assets/images/ordina-logo.png')} style={styles.logo} contentFit="contain" />
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
              <ThemedText style={styles.proposalTitle}>What do you need to get done?</ThemedText>
              <ThemedText themeColor="textSecondary">
                Type, speak, snap a photo of a list, or record a short video. ORDINA turns it into a schedule you
                review before anything is saved.
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
                  onPress={() => void send(reply)}
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
              <ThemedText themeColor="textSecondary">ORDINA is thinking…</ThemedText>
            </View>
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

        {keyboardOpen || attachment ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quick}>
          {QUICK_PROMPTS.map((label) => (
            <Pressable
              key={label}
              disabled={busy}
              onPress={() => void send(label)}
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
          <Pressable
            accessibilityLabel="Attach photo or video"
            disabled={busy || Platform.OS === 'web'}
            onPress={() => setAttachOpen((open) => !open)}
            style={[styles.mic, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name={attachOpen ? 'close' : 'add'} size={20} color={theme.text} />
          </Pressable>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={voice === 'listening'
              ? 'Listening… tap stop when done'
              : attachment
                ? 'e.g. “Create tasks from this list”'
                : 'Tell ORDINA what you need…'}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            onFocus={() => setAttachOpen(false)}
            style={[styles.input, { color: theme.text }]}
          />
          <Pressable
            accessibilityLabel={voice === 'listening' ? 'Stop recording' : 'Speak'}
            disabled={busy && voice !== 'listening'}
            onPress={() => void toggleVoice()}
            style={[styles.mic, { backgroundColor: voice === 'listening' ? theme.danger : theme.secondary }]}>
            <Ionicons name={voice === 'listening' ? 'stop' : 'mic'} size={18} color="#FFFFFF" />
          </Pressable>
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
  logo: { width: 32, height: 32 },
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
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
