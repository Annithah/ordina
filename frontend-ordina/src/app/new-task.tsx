import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContactActions } from '@/components/contact-actions';
import { PlanReview } from '@/components/plan-review';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { CategoryBadge, CategoryPicker, asIcon } from '@/components/category-ui';
import { knownCategory } from '@/features/categories';
import { pickerOrder } from '@/features/category-tree';
import { bestTime, defaultCategory, defaultReminderLead } from '@/features/starting-point';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { cancelTaskReminder, scheduleTaskReminder } from '@/services/notifications';
import { useAuthStore } from '@/store/auth-store';
import { nameOf, useCategoriesStore } from '@/store/categories-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useTasksStore, type Category, type Priority, type Task } from '@/store/tasks-store';
import { addLocalDays, localDateKey } from '@/utils/dates';
import {
  detectSchedule,
  durationToMinutes,
  findClashes,
  findFreeSlot,
  formatDuration,
  formatTime12,
  minutesFromTime,
  minutesToDuration,
  plannedMinutes,
  timeFromMinutes,
} from '@/utils/task-planning';
import { DESCRIPTION_MAX, TITLE_MAX, friendlyError, validateTaskForm, type TaskFieldErrors } from '@/utils/task-validation';
import { FEATURES, LOCAL_MODE } from '@/config/release';
import { isTimeOver, parsedToDrafts } from '@/features/tasks/parsed-drafts';
import { PARSED_TITLE_MAX, PLAN_INPUT_MAX, parseTasks } from '@/features/tasks/parseTasks';
import { confirmPlan } from '@/services/ai';
import { confirmLocalPlan } from '@/services/local-tasks';
import type { DraftTask } from '@/types/plan';
import { toConfirmPayload } from '@/utils/plan-draft';

type IconName = keyof typeof Ionicons.glyphMap;

const PRIORITIES: { id: Priority; color: string }[] = [
  { id: 'low', color: '#3B82F6' },
  { id: 'medium', color: '#F59E0B' },
  { id: 'high', color: '#EF4444' },
];

// The date/time picker is native-only; the web build keeps the preset chips.
const HAS_NATIVE_PICKER = Platform.OS === 'android' || Platform.OS === 'ios';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const REPEATS: { id: string; label: string; recurrence: NonNullable<Task['recurrence']>; rule?: string }[] = [
  { id: 'none', label: 'Never', recurrence: 'none' },
  { id: 'daily', label: 'Every day', recurrence: 'daily' },
  { id: 'weekdays', label: 'Weekdays', recurrence: 'custom', rule: '1,2,3,4,5' },
  { id: 'weekly', label: 'Weekly', recurrence: 'weekly' },
  { id: 'monthly', label: 'Monthly', recurrence: 'monthly' },
];

const REMINDERS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: 'task.reminderOff' },
  { minutes: 0, label: 'task.atStart' },
  { minutes: 10, label: 'task.min10' },
  { minutes: 30, label: 'task.min30' },
  { minutes: 60, label: 'task.hour1' },
  { minutes: 1440, label: 'task.day1' },
];

function dateFromKey(key: string, time?: string) {
  const [y, m, d] = key.split('-').map(Number);
  const minutes = minutesFromTime(time) ?? 9 * 60;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
}

function nextWeekday(day: number) {
  const today = new Date();
  const delta = (day - today.getDay() + 7) % 7 || 7;
  return addLocalDays(localDateKey(today), delta);
}

function Section({ icon, title, children, right }: { icon: IconName; title: string; children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={theme.primary} />
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        {right}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, color, icon }: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
  icon?: IconName;
}) {
  const theme = useTheme();
  const tint = color ?? theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? tint : theme.border,
          backgroundColor: active ? `${tint}1F` : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? tint : theme.textSecondary} /> : null}
      <ThemedText style={[styles.chipText, { color: active ? tint : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

/** "Custom" duration: hours and minutes (5-minute steps), between 5 minutes and 24 hours. */
function CustomDuration({ visible, minutes, onSave, onCancel }: {
  visible: boolean;
  minutes: number;
  onSave: (minutes: number) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  // Remounted (new key) each time it opens, so it starts from the current duration.
  const [hours, setHours] = useState(Math.floor(minutes / 60));
  const [mins, setMins] = useState((Math.round((minutes % 60) / 5) * 5) % 60);

  const total = Math.min(24 * 60, Math.max(5, hours * 60 + mins));
  const steppers = [
    { label: t('task.hours'), value: hours, minus: () => setHours((h) => Math.max(0, h - 1)), plus: () => setHours((h) => Math.min(24, h + 1)) },
    { label: t('task.minutes'), value: mins, minus: () => setMins((m) => (m + 55) % 60), plus: () => setMins((m) => (m + 5) % 60) },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <ThemedText style={styles.headerTitle}>{t('task.customTitle')}</ThemedText>
          <View style={styles.stepperRow}>
            {steppers.map((item) => (
              <View key={item.label} style={[styles.stepper, { borderColor: theme.border }]}>
                <ThemedText themeColor="textSecondary" style={styles.helper}>{item.label}</ThemedText>
                <View style={styles.stepperControls}>
                  <Pressable accessibilityLabel={`${item.label} −`} onPress={item.minus} style={[styles.stepperBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="remove" size={18} color={theme.text} />
                  </Pressable>
                  <ThemedText style={styles.stepperValue}>{item.value}</ThemedText>
                  <Pressable accessibilityLabel={`${item.label} +`} onPress={item.plus} style={[styles.stepperBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="add" size={18} color={theme.text} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <ThemedText themeColor="textSecondary" style={[styles.summary, { fontSize: 14 }]}>{formatDuration(total)}</ThemedText>
          <View style={styles.customActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.cancelBtn, { borderColor: theme.border }]}>
              <ThemedText style={styles.slotText}>{t('common.cancel')}</ThemedText>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={t('common.save')} onPress={() => onSave(total)} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function NewTaskScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ id?: string | string[]; date?: string; time?: string; category?: string }>();
  const presetDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const presetTime = typeof params.time === 'string' && /^\d{2}:\d{2}$/.test(params.time) ? params.time : undefined;
  const presetCategory = knownCategory(params.category) ?? undefined;
  const taskId = Array.isArray(params.id) ? params.id[0] : params.id;
  const tasks = useTasksStore((s) => s.tasks);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const taskToEdit = useMemo(() => tasks.find((task) => task.id === taskId), [tasks, taskId]);
  const [lookupDone, setLookupDone] = useState(false);

  // Opened directly (e.g. after a restart): fetch the list before deciding the task is missing.
  useEffect(() => {
    if (!taskId || taskToEdit) return;
    let alive = true;
    void loadTasks().finally(() => {
      if (alive) setLookupDone(true);
    });
    return () => {
      alive = false;
    };
  }, [taskId, taskToEdit, loadTasks]);

  if (taskId && !taskToEdit) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: theme.background }]}>
        {lookupDone ? (
          <>
            <ThemedText style={styles.headerTitle}>{t('task.notFound')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('task.notFoundBody')}</ThemedText>
            <View style={{ width: 220 }}>
              <PrimaryButton label={t('task.backToTasks')} onPress={() => router.back()} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={theme.primary} />
        )}
      </SafeAreaView>
    );
  }
  return <TaskForm key={taskToEdit?.id ?? 'new'} taskToEdit={taskToEdit} presetDate={presetDate} presetTime={presetTime} presetCategory={presetCategory} />;
}

function TaskForm({ taskToEdit, presetDate, presetTime, presetCategory }: { taskToEdit?: Task; presetDate?: string; presetTime?: string; presetCategory?: string }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const answers = usePreferencesStore((s) => s.answers);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const { tasks, addTask, updateTask, deleteTask, loadTasks } = useTasksStore();
  const isEditMode = Boolean(taskToEdit);

  const [title, setTitle] = useState(taskToEdit?.title ?? '');
  const [notes, setNotes] = useState(taskToEdit?.description ?? '');
  const [priority, setPriority] = useState<Priority>(taskToEdit?.priority ?? 'medium');
  // A new task starts from the intro answers: the user's own area, their reminder choice.
  const [category, setCategoryState] = useState<Category>(taskToEdit?.category ?? presetCategory ?? defaultCategory(answers));
  const categoryTouched = useRef(Boolean(taskToEdit || presetCategory));
  const [categoryPicker, setCategoryPicker] = useState(false);
  const categories = useCategoriesStore((s) => s.categories);
  const recentCategories = useCategoriesStore((s) => s.recent);
  const suggest = useCategoriesStore((s) => s.suggest);
  const learn = useCategoriesStore((s) => s.learn);
  const [customOpen, setCustomOpen] = useState(false);
  const [dueDate, setDueDate] = useState(taskToEdit?.dueDate ?? presetDate ?? localDateKey());
  const [startTime, setStartTime] = useState(taskToEdit?.startTime ?? presetTime ?? '');
  const [minutes, setMinutes] = useState(durationToMinutes(taskToEdit?.duration ?? '1h'));
  const [repeatId, setRepeatId] = useState(() => {
    if (!taskToEdit) return 'none';
    const repeat = REPEATS.find((item) => item.recurrence === taskToEdit.recurrence
      && (item.rule ?? undefined) === (taskToEdit.recurrence === 'custom' ? taskToEdit.recurrenceRule : undefined));
    return repeat?.id ?? 'none';
  });
  const [reminderLead, setReminderLead] = useState<number | null>(
    taskToEdit ? (taskToEdit.reminder ? 10 : null) : defaultReminderLead(answers, 'medium'),
  );
  const reminderTouched = useRef(Boolean(taskToEdit));
  const [contact, setContact] = useState<{ name: string; phone?: string } | null>(
    taskToEdit?.contactName ? { name: taskToEdit.contactName, phone: taskToEdit.contactPhone } : null,
  );
  const [iosPicker, setIosPicker] = useState<null | 'date' | 'time'>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(taskToEdit?.deadline ?? null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Several activities written as one text: reviewed here before anything is saved.
  const [preview, setPreview] = useState<{ planId: string; drafts: DraftTask[] } | null>(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const savingPreviewRef = useRef(false);

  const detected = useMemo(() => detectSchedule(title), [title]);
  const plannedCount = useMemo(() => (isEditMode ? 0 : parseTasks(title).length), [isEditMode, title]);
  const clashes = useMemo(
    () => findClashes(tasks, dueDate, startTime || undefined, minutes, taskToEdit?.id),
    [tasks, dueDate, startTime, minutes, taskToEdit?.id],
  );
  const dayLoad = plannedMinutes(tasks, dueDate, taskToEdit?.id);
  const loadAfter = dayLoad + minutes;
  const loadColor = loadAfter > 8 * 60 ? theme.danger : loadAfter > 5 * 60 ? theme.warning : theme.success;
  const today = localDateKey();
  const isPast = dueDate < today || (dueDate === today && startTime !== '' && (minutesFromTime(startTime) ?? 0) < new Date().getHours() * 60 + new Date().getMinutes());

  const dateOptions = [
    { label: t('task.today'), value: today },
    { label: t('task.tomorrow'), value: addLocalDays(today, 1) },
    { label: t('task.saturday'), value: nextWeekday(6) },
    { label: t('task.nextMonday'), value: nextWeekday(1) },
  ];
  const timeOptions = [
    { label: t('task.morning'), value: '09:00' },
    { label: t('task.afternoon'), value: '14:00' },
    { label: t('task.evening'), value: '18:00' },
  ];
  // The intro's "best hours" answer is offered as its own time when it isn't one of the presets.
  const favouriteTime = bestTime(answers);
  const showFavourite = Boolean(favouriteTime && !timeOptions.some((item) => item.value === favouriteTime));
  const presetTimes = [...timeOptions.map((item) => item.value), ...(showFavourite ? [favouriteTime!] : [])];
  const customDuration = !DURATIONS.includes(minutes);

  // A new task's category follows its title ("Pay rent" -> Bills) until the user picks one.
  const suggestion = useMemo(() => (isEditMode ? null : suggest(title)), [isEditMode, suggest, title, categories]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!categoryTouched.current) setCategoryState(suggestion ?? presetCategory ?? defaultCategory(answers));
  }, [suggestion, presetCategory, answers]);

  function setCategory(id: string) {
    categoryTouched.current = true;
    setCategoryState(id);
  }

  const { pinned, recent } = pickerOrder(categories, recentCategories);
  const quickCategories = [...pinned, ...recent].filter((record, index, list) => list.findIndex((item) => item.id === record.id) === index).slice(0, 6);

  /** Today / Tomorrow, or the date in the app language. */
  function dayLabel(key: string) {
    if (key === today) return t('task.today');
    if (key === addLocalDays(today, 1)) return t('task.tomorrow');
    return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function choosePriority(next: Priority) {
    setPriority(next);
    // "Only important things": a new task gets a reminder once it is marked High.
    if (!reminderTouched.current) setReminderLead(defaultReminderLead(answers, next));
  }

  function applyDetected() {
    if (!detected) return;
    if (detected.date) setDueDate(detected.date);
    if (detected.time) setStartTime(detected.time);
    setTitle(detected.cleanTitle);
  }

  function openPicker(mode: 'date' | 'time') {
    const value = dateFromKey(dueDate, startTime);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: false,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type !== 'set' || !selected) return;
          if (mode === 'date') setDueDate(localDateKey(selected));
          else setStartTime(timeFromMinutes(selected.getHours() * 60 + selected.getMinutes()));
        },
      });
      return;
    }
    setIosPicker(mode);
  }

  async function pickContact() {
    try {
      const Contacts = await import('expo-contacts/legacy');
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Contacts', 'Allow contacts access to link a person to this task.');
        return;
      }
      const picked = await Contacts.presentContactPickerAsync();
      if (!picked) return;
      const phone = picked.phoneNumbers?.find((item) => item.isPrimary)?.number ?? picked.phoneNumbers?.[0]?.number;
      setContact({ name: picked.name || 'Contact', phone: phone || undefined });
    } catch (error: any) {
      Alert.alert('Contacts', error?.message || 'Could not open your contacts.');
    }
  }

  function suggestSlot() {
    const slot = findFreeSlot(tasks, dueDate, minutes, taskToEdit?.id);
    if (slot) {
      setStartTime(slot);
      return;
    }
    const nextDay = addLocalDays(dueDate, 1);
    const tomorrowSlot = findFreeSlot(tasks, nextDay, minutes, taskToEdit?.id);
    Alert.alert(
      t('task.dayFull'),
      tomorrowSlot
        ? t('task.noGapMove', { duration: formatDuration(minutes), day: dayLabel(dueDate), next: dayLabel(nextDay), time: formatTime12(tomorrowSlot) })
        : t('task.noGap', { duration: formatDuration(minutes), day: dayLabel(dueDate) }),
      tomorrowSlot
        ? [
          { text: t('task.keep'), style: 'cancel' },
          { text: t('task.moveIt'), onPress: () => { setDueDate(nextDay); setStartTime(tomorrowSlot); } },
        ]
        : undefined,
    );
  }

  async function saveTask() {
    if (saving) return;
    let taskTitle = title.trim();
    let taskNotes = notes.trim();
    if (!isEditMode) {
      const parsed = parseTasks(title);
      if (parsed.length > 1) {
        setErrors({});
        setSaveError(null);
        setPreview({ planId: Crypto.randomUUID(), drafts: parsedToDrafts(parsed) });
        return;
      }
      // One long activity: a short title, with the full text kept as the description.
      if (taskTitle.length > PARSED_TITLE_MAX && parsed.length === 1) {
        if (!taskNotes) taskNotes = taskTitle;
        taskTitle = parsed[0].title;
      }
    }
    const found = validateTaskForm({ title: taskTitle, description: taskNotes, dueDate, startTime, durationMinutes: minutes });
    setErrors(found);
    setSaveError(null);
    if (Object.keys(found).length) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    const repeat = REPEATS.find((item) => item.id === repeatId) ?? REPEATS[0];
    const payload = {
      title: taskTitle,
      description: taskNotes,
      status: taskToEdit?.status ?? 'todo',
      priority,
      category,
      dueDate,
      startTime: startTime || undefined,
      duration: minutesToDuration(minutes),
      reminder: reminderLead !== null,
      recurrence: repeat.recurrence,
      recurrenceRule: repeat.rule,
      contactName: contact?.name ?? '',
      contactPhone: contact?.phone ?? '',
      completed: taskToEdit?.completed ?? false,
      ...(taskToEdit?.deadline && !deadline ? { deadline: null } : {}),
    } as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

    setSaving(true);
    // The user changed ORDINA's suggestion: remember it for next time.
    if (!isEditMode && suggestion && category !== suggestion) void learn(taskTitle, suggestion, category);
    let savedTaskId = taskToEdit?.id;
    try {
      if (taskToEdit) await updateTask(taskToEdit.id, payload);
      else savedTaskId = (await addTask(payload)).id;
    } catch (error: any) {
      setSaving(false);
      const serverErrors = error?.response?.data?.errors;
      if (serverErrors && typeof serverErrors === 'object') setErrors(serverErrors);
      setSaveError(friendlyError(error, t('task.saveFailed')));
      return;
    }

    if (savedTaskId) {
      // The task is saved. Local notifications are best-effort and must never hold up saving.
      const id = savedTaskId;
      const reminder = FEATURES.taskReminders && reminderLead !== null
        ? (() => {
          const start = dateFromKey(dueDate, startTime || '09:00');
          const when = new Date(start.getTime() - reminderLead * 60_000);
          return scheduleTaskReminder(id, payload.title, when.getTime() > Date.now() ? when : start, {
            body: startTime
              ? `${dayLabel(dueDate)} · ${formatTime12(startTime)}${contact ? ` · ${contact.name}` : ''}`
              : t('task.plannedFor', { day: dayLabel(dueDate) }),
          });
        })()
        : cancelTaskReminder(id);
      void Promise.resolve(reminder).catch(() => undefined);
    }
    setSaving(false);
    toast.success(isEditMode ? t('task.changesSaved') : t('task.added'));
    router.back();
  }

  /** Saves every previewed task in one go; the plan id stops a double tap from adding them twice. */
  async function savePreviewTasks() {
    if (!preview || savingPreviewRef.current) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    savingPreviewRef.current = true;
    setSavingPreview(true);
    const payload = toConfirmPayload(preview.drafts);
    for (const draft of preview.drafts) {
      if (draft.suggestedCategory && draft.category !== draft.suggestedCategory) void learn(draft.title, draft.suggestedCategory, draft.category);
    }
    try {
      if (LOCAL_MODE) await confirmLocalPlan(preview.planId, payload);
      else await confirmPlan(preview.planId, payload);
    } catch (error) {
      savingPreviewRef.current = false;
      setSavingPreview(false);
      toast.error(friendlyError(error, 'Could not save the tasks. Please try again.'));
      return;
    }
    await loadTasks().catch(() => undefined);
    toast.success(`${payload.length} tasks added to your plan`);
    router.back();
  }

  async function removeTask() {
    if (!taskToEdit || deleting) return;
    setDeleting(true);
    try {
      await deleteTask(taskToEdit.id);
      setConfirmingDelete(false);
      toast.success(t('task.deleted'));
      router.back();
    } catch (error) {
      setDeleting(false);
      setConfirmingDelete(false);
      toast.error(friendlyError(error, t('task.deleteFailed')));
    }
  }

  const summary = [
    dayLabel(dueDate),
    startTime ? formatTime12(startTime) : t('task.anytime'),
    formatDuration(minutes),
  ].join(' · ');

  if (preview) {
    const count = preview.drafts.length;
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to your text" disabled={savingPreview} onPress={() => setPreview(null)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>New tasks</ThemedText>
          <View style={styles.iconBtn} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <PlanReview
              heading={count === 1 ? 'ORDINA found 1 task' : `ORDINA found ${count} tasks`}
              subheading="Check them before saving. Tap a task to change it, or remove it."
              summary={title}
              tasks={preview.drafts}
              questions={[]}
              assumptions={[]}
              answers={{}}
              today={localDateKey()}
              saving={savingPreview}
              replanning={false}
              groupByDay
              titleMax={PARSED_TITLE_MAX}
              needsNewTime={(task) => isTimeOver(task)}
              confirmLabel={(n) => (n === 1 ? 'Create 1 task' : `Create ${n} tasks`)}
              onChangeTasks={(drafts) => setPreview((current) => (current ? { ...current, drafts } : current))}
              onAnswer={() => undefined}
              onSubmitAnswers={() => undefined}
              onConfirm={() => void savePreviewTasks()}
              onCancel={() => setPreview(null)}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('common.close')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{isEditMode ? t('task.editTitle') : t('task.newTitle')}</ThemedText>
        {isEditMode ? (
          <Pressable accessibilityLabel={t('common.delete')} onPress={() => setConfirmingDelete(true)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="trash-outline" size={18} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={[styles.titleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (errors.title) setErrors(({ title: _cleared, ...rest }) => rest);
              }}
              placeholder={isEditMode ? t('task.placeholderEdit') : t('task.placeholder')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={isEditMode ? 'Task title' : 'Task or plan'}
              autoFocus={!isEditMode}
              maxLength={isEditMode ? TITLE_MAX : PLAN_INPUT_MAX}
              multiline
              scrollEnabled
              style={[styles.titleInput, { color: theme.text }]}
            />
            {!isEditMode && title.length >= PLAN_INPUT_MAX - 200 ? (
              <ThemedText
                accessibilityLiveRegion="polite"
                style={[styles.counter, { color: title.length >= PLAN_INPUT_MAX ? theme.danger : theme.textSecondary }]}>
                {title.length} / {PLAN_INPUT_MAX}
              </ThemedText>
            ) : null}
            {errors.title ? (
              <ThemedText accessibilityRole="alert" style={[styles.fieldError, { color: theme.danger }]}>{errors.title}</ThemedText>
            ) : null}
            {plannedCount > 1 ? (
              <View style={[styles.detected, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="list" size={14} color={theme.primary} />
                <ThemedText style={[styles.detectedText, { color: theme.primary }]}>
                  {t('task.found', { n: plannedCount })}
                </ThemedText>
              </View>
            ) : detected && (detected.date !== dueDate || (detected.time && detected.time !== startTime)) ? (
              <Pressable onPress={applyDetected} style={[styles.detected, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="flash" size={14} color={theme.primary} />
                <ThemedText style={[styles.detectedText, { color: theme.primary }]}>
                  {t('task.setTo', { label: detected.label })}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.detectedHint}>{t('task.tapToApply')}</ThemedText>
              </Pressable>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.tip}>
                {isEditMode ? t('task.tipEdit') : t('task.tip')}
              </ThemedText>
            )}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('task.description')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Task description"
              maxLength={DESCRIPTION_MAX}
              multiline
              style={[styles.notesInput, { color: theme.text, borderTopColor: theme.border }]}
            />
          </View>

          <Section
            icon="calendar-outline"
            title={t('task.when')}
            right={
              <ThemedText style={[styles.sectionValue, { color: isPast ? theme.danger : theme.textSecondary }]}>
                {isPast ? t('task.inPast') : dayLabel(dueDate)}
              </ThemedText>
            }>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {dateOptions.map((item) => (
                <Chip key={item.label} label={item.label} active={dueDate === item.value} onPress={() => setDueDate(item.value)} />
              ))}
              {HAS_NATIVE_PICKER ? (
                <Chip
                  label={dateOptions.some((item) => item.value === dueDate) ? t('task.pickDate') : dayLabel(dueDate)}
                  icon="calendar"
                  active={!dateOptions.some((item) => item.value === dueDate)}
                  onPress={() => openPicker('date')}
                />
              ) : !dateOptions.some((item) => item.value === dueDate) ? (
                <Chip label={dayLabel(dueDate)} icon="calendar" active onPress={() => undefined} />
              ) : null}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label={t('task.anytime')} icon="infinite-outline" active={!startTime} onPress={() => setStartTime('')} />
              {HAS_NATIVE_PICKER ? (
                <Chip
                  label={startTime && !presetTimes.includes(startTime) ? formatTime12(startTime) : t('task.pickTime')}
                  icon="time-outline"
                  active={Boolean(startTime) && !presetTimes.includes(startTime)}
                  onPress={() => openPicker('time')}
                />
              ) : startTime && !presetTimes.includes(startTime) ? (
                <Chip label={formatTime12(startTime)} icon="time-outline" active onPress={() => undefined} />
              ) : null}
              {showFavourite ? (
                <Chip label={formatTime12(favouriteTime)} icon="star-outline" active={startTime === favouriteTime} onPress={() => setStartTime(favouriteTime!)} />
              ) : null}
              {timeOptions.map((item) => (
                <Chip key={item.value} label={item.label} active={startTime === item.value} onPress={() => setStartTime(item.value)} />
              ))}
            </ScrollView>

            <View style={[styles.load, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.loadHead}>
                <ThemedText themeColor="textSecondary" style={styles.loadText}>
                  {t('task.alreadyPlanned', { day: dayLabel(dueDate), time: formatDuration(dayLoad) })}
                </ThemedText>
                <ThemedText style={[styles.loadText, { color: loadColor }]}>
                  {loadAfter > 8 * 60 ? t('task.overloaded') : loadAfter > 5 * 60 ? t('task.busy') : t('task.light')}
                </ThemedText>
              </View>
              <View style={[styles.loadTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.loadFill, { width: `${Math.min(100, (loadAfter / (10 * 60)) * 100)}%`, backgroundColor: loadColor }]} />
              </View>
            </View>

            {clashes.length ? (
              <View style={[styles.warning, { borderColor: theme.warning }]}>
                <Ionicons name="warning-outline" size={16} color={theme.warning} />
                <ThemedText style={styles.warningText}>
                  {t('task.overlaps', { list: clashes.map((task) => `“${task.title}”`).join(', ') })}
                </ThemedText>
              </View>
            ) : null}
            <Pressable onPress={suggestSlot} style={[styles.slotBtn, { borderColor: theme.primary }]}>
              <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
              <ThemedText style={[styles.slotText, { color: theme.primary }]}>{t('task.findSlot')}</ThemedText>
            </Pressable>
          </Section>

          {deadline ? (
            <View style={[styles.warning, { borderColor: theme.danger }]}>
              <Ionicons name="flag-outline" size={16} color={theme.danger} />
              <ThemedText style={styles.warningText}>
                {t('task.deadline', { day: dayLabel(deadline.split('T')[0]) })}
                {deadline.includes('T') ? t('task.deadlineBefore', { time: formatTime12(deadline.split('T')[1]) }) : ''}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.remove')} onPress={() => setDeadline(null)} style={styles.removeDeadline}>
                <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('common.remove')}</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <Section icon="hourglass-outline" title={t('task.duration')} right={<ThemedText themeColor="textSecondary" style={styles.sectionValue}>{formatDuration(minutes)}</ThemedText>}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip
                label={customDuration ? formatDuration(minutes) : t('task.custom')}
                icon="options-outline"
                active={customDuration}
                onPress={() => setCustomOpen(true)}
              />
              {DURATIONS.map((value) => (
                <Chip key={value} label={formatDuration(value)} active={minutes === value} onPress={() => setMinutes(value)} />
              ))}
            </ScrollView>
            {startTime ? (
              <ThemedText themeColor="textSecondary" style={styles.helper}>
                {t('task.endsAt', { time: formatTime12(timeFromMinutes((minutesFromTime(startTime) ?? 0) + minutes)) })}
              </ThemedText>
            ) : null}
          </Section>

          <Section icon="flag-outline" title={t('task.priority')}>
            <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
              {PRIORITIES.map((item) => {
                const active = priority === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => choosePriority(item.id)}
                    style={[styles.segmentItem, active && { backgroundColor: theme.card, borderColor: item.color }]}>
                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                    <ThemedText style={[styles.segmentText, active && { color: item.color }]}>{t(`task.${item.id}`)}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section icon="pricetag-outline" title={t('task.category')}>
            <View style={styles.categoryRow}>
              <CategoryBadge id={category} onPress={() => setCategoryPicker(true)} />
              {!isEditMode && suggestion && suggestion === category ? (
                <View style={styles.suggestedTag}>
                  <Ionicons name="sparkles" size={12} color={theme.primary} />
                  <ThemedText style={[styles.helper, { color: theme.primary }]}>{t('categories.autoPicked')}</ThemedText>
                </View>
              ) : null}
            </View>
            {quickCategories.length ? (
              <View style={styles.wrap}>
                {quickCategories.filter((item) => item.id !== category).map((item) => (
                  <Chip
                    key={item.id}
                    label={nameOf(item)}
                    icon={asIcon(item.icon)}
                    color={item.color}
                    active={false}
                    onPress={() => setCategory(item.id)}
                  />
                ))}
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setCategoryPicker(true)} style={styles.moreCategories}>
              <ThemedText style={[styles.slotText, { color: theme.primary }]}>{t('categories.allCategories')}</ThemedText>
              <Ionicons name="chevron-forward" size={14} color={theme.primary} />
            </Pressable>
            <CategoryPicker
              visible={categoryPicker}
              value={category}
              onSelect={(id) => {
                setCategory(id);
                setCategoryPicker(false);
              }}
              onClose={() => setCategoryPicker(false)}
            />
          </Section>

          {FEATURES.taskReminders ? <Section icon="notifications-outline" title={t('task.reminder')}>
            <View style={styles.wrap}>
              {REMINDERS.map((item) => (
                <Chip
                  key={item.label}
                  label={t(item.label)}
                  active={reminderLead === item.minutes}
                  onPress={() => {
                    reminderTouched.current = true;
                    setReminderLead(item.minutes);
                  }}
                />
              ))}
            </View>
          </Section> : null}

          {FEATURES.repeatingTasks ? (
            <Section icon="repeat-outline" title="Repeat">
              <View style={styles.wrap}>
                {REPEATS.map((item) => (
                  <Chip key={item.id} label={item.label} active={repeatId === item.id} onPress={() => setRepeatId(item.id)} />
                ))}
              </View>
            </Section>
          ) : null}

          {FEATURES.contacts ? <Section icon="people-outline" title="With someone">
            {contact ? (
              <View style={styles.contactRow}>
                <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>
                    {contact.name.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.contactName} numberOfLines={1}>{contact.name}</ThemedText>
                  {contact.phone ? <ThemedText themeColor="textSecondary" style={styles.helper}>{contact.phone}</ThemedText> : null}
                </View>
                <ContactActions name={contact.name} phone={contact.phone} compact />
                <Pressable accessibilityLabel="Remove person" hitSlop={8} onPress={() => setContact(null)}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => void pickContact()} style={[styles.slotBtn, { borderColor: theme.border }]}>
                <Ionicons name="person-add-outline" size={16} color={theme.text} />
                <ThemedText style={styles.slotText}>Link a contact for quick call & message</ThemedText>
              </Pressable>
            )}
          </Section> : null}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          {saveError || Object.keys(errors).some((key) => key !== 'title') ? (
            <ThemedText accessibilityRole="alert" style={[styles.fieldError, { color: theme.danger, textAlign: 'center' }]}>
              {saveError ?? Object.entries(errors).find(([key]) => key !== 'title')?.[1]}
            </ThemedText>
          ) : null}
          <ThemedText themeColor="textSecondary" style={styles.summary} numberOfLines={1}>
            {summary}
            {reminderLead !== null ? ' · 🔔' : ''}
            {repeatId !== 'none' ? ' · 🔁' : ''}
          </ThemedText>
          <PrimaryButton
            label={saving ? t('task.saving') : isEditMode ? t('task.saveChanges') : plannedCount > 1 ? t('task.review', { n: plannedCount }) : t('task.create')}
            disabled={saving}
            onPress={() => void saveTask()}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmingDelete}
        title={t('task.deleteTitle')}
        message={t('task.deleteBody', { title: taskToEdit?.title ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        busy={deleting}
        onConfirm={() => void removeTask()}
        onCancel={() => setConfirmingDelete(false)}
      />

      {Platform.OS === 'ios' ? (
        <Modal transparent visible={iosPicker !== null} animationType="fade" onRequestClose={() => setIosPicker(null)}>
          <Pressable style={styles.backdrop} onPress={() => setIosPicker(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              {iosPicker ? (
                <DateTimePicker
                  value={dateFromKey(dueDate, startTime)}
                  mode={iosPicker}
                  display={iosPicker === 'date' ? 'inline' : 'spinner'}
                  onChange={(_event, selected) => {
                    if (!selected) return;
                    if (iosPicker === 'date') setDueDate(localDateKey(selected));
                    else setStartTime(timeFromMinutes(selected.getHours() * 60 + selected.getMinutes()));
                  }}
                />
              ) : null}
              <PrimaryButton label={t('common.done')} onPress={() => setIosPicker(null)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <CustomDuration
        key={customOpen ? 'open' : 'closed'}
        visible={customOpen}
        minutes={minutes}
        onCancel={() => setCustomOpen(false)}
        onSave={(value) => {
          setMinutes(value);
          setCustomOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  fieldError: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  form: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  titleCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  titleInput: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', paddingVertical: 4, minHeight: 36, maxHeight: 260, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, fontFamily: 'Poppins_500Medium' },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  detectedText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  detectedHint: { fontSize: 11 },
  tip: { fontSize: 11 },
  notesInput: { fontFamily: 'Poppins_400Regular', fontSize: 14, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, minHeight: 40, textAlignVertical: 'top' },
  section: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  sectionValue: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  chipRow: { gap: 8, paddingRight: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  load: { borderRadius: 12, padding: 10, gap: 6 },
  loadHead: { flexDirection: 'row', justifyContent: 'space-between' },
  loadText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  loadTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  loadFill: { height: 6, borderRadius: 3 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  warningText: { flex: 1, fontSize: 12 },
  removeDeadline: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  slotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  slotText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  helper: { fontSize: 12 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  suggestedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  moreCategories: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 36 },
  stepperRow: { flexDirection: 'row', gap: 12 },
  stepper: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: 'center', gap: 6 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 22, fontFamily: 'Poppins_700Bold', minWidth: 36, textAlign: 'center' },
  customActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontFamily: 'Poppins_500Medium' },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  summary: { fontSize: 12, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 12 },
});
