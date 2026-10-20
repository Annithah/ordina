/**
 * New / edit task. When: a day, then "Anytime" or a time from the native picker. Duration:
 * 15 min / 30 min / 1 h / 2 h, a custom value (5 min - 12 h) or none. One category per task
 * (suggested from the title for new tasks). Reminder: none, at start, 5/15/30 min, 1 hour,
 * 1 day before, or a custom time (Anytime tasks: a time the user picks).
 * Writing several activities in the title opens a preview that splits them into tasks.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, type IconName } from '@/components/chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PlanReview } from '@/components/plan-review';
import { PrimaryButton } from '@/components/primary-button';
import { useReminderPermission } from '@/components/reminder-permission';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatDuration, formatMoment, formatTime } from '@/i18n/format';
import { isTimeOver, parsedToDrafts } from '@/features/tasks/parsed-drafts';
import { PARSED_TITLE_MAX, PLAN_INPUT_MAX, parseTasks } from '@/features/tasks/parseTasks';
import { suggestCategoryId } from '@/logic/categories';
import { ANYTIME_REMINDER_OPTIONS, TIMED_REMINDER_OPTIONS, localDateTime, reminderTime, type ReminderOption } from '@/logic/reminders';
import {
  DURATION_MAX,
  DURATION_MIN,
  DURATION_PRESETS,
  durationMinutes,
  durationValue,
  findOverlaps,
  isValidCustomDuration,
  minutesOf,
  span,
  timeOf,
} from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import { confirmLocalPlan } from '@/services/local-tasks';
import { useSettingsStore } from '@/store/settings-store';
import { useTasksStore, type Priority, type Task } from '@/store/tasks-store';
import type { DraftTask } from '@/types/plan';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { toConfirmPayload } from '@/utils/plan-draft';
import { detectSchedule, findFreeSlot } from '@/utils/task-planning';
import { DESCRIPTION_MAX, TITLE_MAX, friendlyError, validateTaskForm, type TaskFieldErrors } from '@/utils/task-validation';

const PRIORITY_COLORS: Record<Priority, string> = { low: '#3B82F6', medium: '#F59E0B', high: '#EF4444' };
const REMINDER_KEY: Record<ReminderOption, string> = {
  none: 'reminders.none',
  start: 'reminders.start',
  '5': 'reminders.min5',
  '15': 'reminders.min15',
  '30': 'reminders.min30',
  '60': 'reminders.hour1',
  '1440': 'reminders.day1',
  custom: 'reminders.custom',
};
const HAS_NATIVE_PICKER = Platform.OS === 'android' || Platform.OS === 'ios';

const pad = (n: number) => String(n).padStart(2, '0');

function dateAt(key: string, time?: string | null) {
  const [y, m, d] = key.split('-').map(Number);
  const minutes = minutesOf(time) ?? 9 * 60;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
}

const toLocalDateTime = (date: Date) => `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

function Section({ icon, title, children, right }: { icon: IconName; title: string; children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={theme.primary} />
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{title}</ThemedText>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function NewTaskScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ id?: string | string[]; date?: string; time?: string; title?: string }>();
  const presetDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const presetTime = typeof params.time === 'string' && /^\d{2}:\d{2}$/.test(params.time) ? params.time : undefined;
  const presetTitle = typeof params.title === 'string' ? params.title.slice(0, PLAN_INPUT_MAX) : undefined;
  const taskId = Array.isArray(params.id) ? params.id[0] : params.id;
  const tasks = useTasksStore((s) => s.tasks);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const taskToEdit = useMemo(() => tasks.find((task) => task.id === taskId), [tasks, taskId]);
  const [lookupDone, setLookupDone] = useState(false);

  // Opened directly (e.g. from a notification after a restart): load before deciding it is missing.
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
            <ThemedText themeColor="textSecondary">{t('task.notFoundHint')}</ThemedText>
            <View style={{ width: 220 }}>
              <PrimaryButton label={t('task.backToTasks')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={theme.primary} />
        )}
      </SafeAreaView>
    );
  }
  return <TaskForm key={taskToEdit?.id ?? 'new'} taskToEdit={taskToEdit} presetDate={presetDate} presetTime={presetTime} presetTitle={presetTitle} />;
}

function TaskForm({ taskToEdit, presetDate, presetTime, presetTitle }: { taskToEdit?: Task; presetDate?: string; presetTime?: string; presetTitle?: string }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { tasks, addTask, updateTask, deleteTask, loadTasks } = useTasksStore();
  const { categories, find, nameOf } = useCategories();
  const settings = useSettingsStore();
  const permission = useReminderPermission();
  const isEditMode = Boolean(taskToEdit);
  const today = localDateKey();

  const initialCategory = taskToEdit?.categoryId
    ?? (categories.some((category) => category.id === settings.defaultCategoryId) ? settings.defaultCategoryId : find(null).id);
  const initialTime = taskToEdit ? taskToEdit.startTime ?? '' : presetTime ?? '';

  const [title, setTitle] = useState(taskToEdit?.title ?? presetTitle ?? '');
  const [notes, setNotes] = useState(taskToEdit?.description ?? '');
  const [priority, setPriority] = useState<Priority>(taskToEdit?.priority ?? 'medium');
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [categoryTouched, setCategoryTouched] = useState(isEditMode);
  const [dueDate, setDueDate] = useState(taskToEdit?.dueDate ?? presetDate ?? today);
  const [startTime, setStartTime] = useState(initialTime);
  const [minutes, setMinutes] = useState<number | null>(taskToEdit ? durationMinutes(taskToEdit.duration) : settings.defaultDuration);
  const [reminder, setReminder] = useState<ReminderOption>(
    taskToEdit?.reminder ?? (settings.remindersEnabled && initialTime ? settings.defaultReminder : 'none'),
  );
  const [reminderAt, setReminderAt] = useState<string | null>(taskToEdit?.reminderAt ?? null);
  const [deadline, setDeadline] = useState<string | null>(taskToEdit?.deadline ?? null);
  const [iosPicker, setIosPicker] = useState<null | { mode: 'date' | 'time' | 'datetime'; target: 'due' | 'start' | 'reminder' }>(null);
  const [customDuration, setCustomDuration] = useState<{ hours: number; minutes: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dayFull, setDayFull] = useState<null | { nextDay: string; slot: string | null }>(null);
  // Several activities written as one text: reviewed here before anything is saved.
  const [preview, setPreview] = useState<{ planId: string; drafts: DraftTask[] } | null>(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const savingPreviewRef = useRef(false);

  const anytime = !startTime;
  const detected = useMemo(() => detectSchedule(title), [title]);
  const plannedCount = useMemo(() => (isEditMode ? 0 : parseTasks(title).length), [isEditMode, title]);
  const suggestedCategory = useMemo(() => (isEditMode ? null : suggestCategoryId(title, categories.map((c) => c.id))), [isEditMode, title, categories]);
  const overlaps = useMemo(
    () => findOverlaps(tasks, { id: taskToEdit?.id, dueDate, startTime: startTime || null, duration: durationValue(minutes) }),
    [tasks, dueDate, startTime, minutes, taskToEdit?.id],
  );
  const dayLoad = useMemo(
    () => tasks
      .filter((task) => task.id !== taskToEdit?.id && !task.completed && task.dueDate === dueDate)
      .reduce((sum, task) => sum + (durationMinutes(task.duration) ?? 0), 0),
    [tasks, dueDate, taskToEdit?.id],
  );
  const loadAfter = dayLoad + (minutes ?? 0);
  const loadColor = loadAfter > 8 * 60 ? theme.danger : loadAfter > 5 * 60 ? theme.warning : theme.success;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const isPast = dueDate < today || (dueDate === today && !anytime && (minutesOf(startTime) ?? 0) < nowMinutes);
  const reminderOptions = anytime ? ANYTIME_REMINDER_OPTIONS : TIMED_REMINDER_OPTIONS;

  // The title suggests a category until the user picks one themselves.
  useEffect(() => {
    if (!categoryTouched && suggestedCategory) setCategoryId(suggestedCategory);
  }, [categoryTouched, suggestedCategory]);

  // Switching to Anytime drops reminders that count from a start time.
  useEffect(() => {
    if (anytime && reminder !== 'none' && reminder !== 'custom') setReminder('none');
  }, [anytime, reminder]);

  function applyDetected() {
    if (!detected) return;
    if (detected.date) setDueDate(detected.date);
    if (detected.time) setStartTime(detected.time);
    setTitle(detected.cleanTitle);
  }

  function apply(target: 'due' | 'start' | 'reminder', selected: Date, mode: 'date' | 'time' | 'datetime') {
    if (target === 'due') setDueDate(localDateKey(selected));
    else if (target === 'start') setStartTime(timeOf(selected.getHours() * 60 + selected.getMinutes()));
    else {
      const current = reminderAt ? localDateTime(reminderAt) : null;
      const base = current ?? dateAt(dueDate, startTime || '09:00');
      const next = mode === 'date'
        ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), base.getHours(), base.getMinutes())
        : mode === 'time'
          ? new Date(base.getFullYear(), base.getMonth(), base.getDate(), selected.getHours(), selected.getMinutes())
          : selected;
      setReminderAt(toLocalDateTime(next));
      setReminder('custom');
    }
  }

  function openPicker(target: 'due' | 'start' | 'reminder') {
    const value = target === 'reminder'
      ? (reminderAt && localDateTime(reminderAt)) || dateAt(dueDate, startTime || '09:00')
      : dateAt(dueDate, startTime);
    if (Platform.OS === 'android') {
      const is24Hour = locale !== 'en';
      const open = (mode: 'date' | 'time', then?: (picked: Date) => void) => DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type !== 'set' || !selected) return;
          apply(target, selected, mode);
          then?.(selected);
        },
      });
      // A custom reminder needs a day and a time: date first, then time.
      if (target === 'reminder') open('date', () => setTimeout(() => open('time'), 250));
      else open(target === 'due' ? 'date' : 'time');
      return;
    }
    setIosPicker({ mode: target === 'due' ? 'date' : target === 'start' ? 'time' : 'datetime', target });
  }

  async function chooseReminder(option: ReminderOption) {
    if (option === 'none') {
      setReminder('none');
      return;
    }
    if (!(await permission.ensure())) return;
    if (option === 'custom') openPicker('reminder');
    else setReminder(option);
  }

  function suggestSlot() {
    const length = minutes ?? 30;
    const slot = findFreeSlot(tasks, dueDate, length, taskToEdit?.id);
    if (slot) {
      setStartTime(slot);
      return;
    }
    const nextDay = addLocalDays(dueDate, 1);
    setDayFull({ nextDay, slot: findFreeSlot(tasks, nextDay, length, taskToEdit?.id) });
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
        setPreview({ planId: Crypto.randomUUID(), drafts: parsedToDrafts(parsed, t, categories.map((c) => c.id), settings.defaultDuration) });
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

    const payload = {
      title: taskTitle,
      description: taskNotes,
      status: taskToEdit?.status ?? 'todo',
      priority,
      categoryId,
      dueDate,
      startTime: startTime || null,
      duration: durationValue(minutes),
      reminder,
      reminderAt: reminder === 'custom' ? reminderAt : null,
      completed: taskToEdit?.completed ?? false,
      ...(taskToEdit?.deadline && !deadline ? { deadline: null } : {}),
    };

    setSaving(true);
    let saved: Task;
    try {
      saved = taskToEdit ? await updateTask(taskToEdit.id, payload) : await addTask(payload);
    } catch (error) {
      setSaving(false);
      setSaveError(friendlyError(error, t('errors.save')));
      return;
    }
    setSaving(false);
    if (saved.reminder !== 'none' && !saved.completed && !reminderTime(saved)) toast.info(t('reminders.inPast'));
    else toast.success(isEditMode ? t('task.saved') : t('task.added'));
    router.back();
  }

  /** Saves every previewed task in one go; the plan id stops a double tap from adding them twice. */
  async function savePreviewTasks() {
    if (!preview || savingPreviewRef.current) return;
    savingPreviewRef.current = true;
    setSavingPreview(true);
    const payload = toConfirmPayload(preview.drafts);
    try {
      await confirmLocalPlan(preview.planId, payload);
    } catch (error) {
      savingPreviewRef.current = false;
      setSavingPreview(false);
      toast.error(friendlyError(error, t('errors.save')));
      return;
    }
    await loadTasks().catch(() => undefined);
    useTasksStore.setState((state) => ({ version: state.version + 1 }));
    toast.success(t('task.addedMany', { count: payload.length }));
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
      toast.error(friendlyError(error, t('errors.delete')));
    }
  }

  const endTime = (() => {
    const times = span({ startTime: startTime || null, duration: durationValue(minutes) });
    return times && minutes ? timeOf(times[1]) : null;
  })();
  const summary = [
    formatDay(locale, dueDate),
    anytime ? t('task.anytime') : formatTime(locale, startTime),
    minutes ? formatDuration(locale, minutes) : null,
    nameOf(categoryId),
  ].filter(Boolean).join(' · ');
  const reminderMoment = reminder === 'custom' && reminderAt ? localDateTime(reminderAt) : null;

  if (preview) {
    const count = preview.drafts.length;
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('task.backToText')} disabled={savingPreview} onPress={() => setPreview(null)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle} accessibilityRole="header">{t('task.previewTitle')}</ThemedText>
          <View style={styles.iconBtn} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <PlanReview
              heading={t('task.previewHeading', { count })}
              subheading={t('task.previewSub')}
              summary={title}
              tasks={preview.drafts}
              questions={[]}
              assumptions={[]}
              answers={{}}
              today={today}
              saving={savingPreview}
              replanning={false}
              groupByDay
              titleMax={PARSED_TITLE_MAX}
              needsNewTime={(task) => isTimeOver(task)}
              confirmLabel={(n) => t('task.createMany', { count: n })}
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
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle} accessibilityRole="header">{isEditMode ? t('task.editTitle') : t('task.newTitle')}</ThemedText>
        {isEditMode ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('task.deleteTitle')} onPress={() => setConfirmingDelete(true)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
            <Ionicons name="trash-outline" size={18} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={[styles.titleCard, { backgroundColor: theme.card, borderColor: errors.title ? theme.danger : theme.border }]}>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (errors.title) setErrors(({ title: _cleared, ...rest }) => rest);
              }}
              placeholder={isEditMode ? t('task.titlePlaceholder') : t('task.planPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={t('task.titleLabel')}
              autoFocus={!isEditMode && !presetTitle}
              maxLength={isEditMode ? TITLE_MAX : PLAN_INPUT_MAX}
              multiline
              scrollEnabled
              style={[styles.titleInput, { color: theme.text }]}
            />
            {!isEditMode && title.length >= PLAN_INPUT_MAX - 200 ? (
              <ThemedText accessibilityLiveRegion="polite" style={[styles.counter, { color: title.length >= PLAN_INPUT_MAX ? theme.danger : theme.textSecondary }]}>
                {title.length} / {PLAN_INPUT_MAX}
              </ThemedText>
            ) : null}
            {errors.title ? (
              <ThemedText accessibilityRole="alert" style={[styles.fieldError, { color: theme.danger }]}>{errors.title}</ThemedText>
            ) : null}
            {plannedCount > 1 ? (
              <View style={[styles.detected, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="list" size={14} color={theme.primary} />
                <ThemedText style={[styles.detectedText, { color: theme.primary }]}>{t('task.found', { count: plannedCount })}</ThemedText>
              </View>
            ) : detected && (detected.date !== dueDate || (detected.time && detected.time !== startTime)) ? (
              <Pressable accessibilityRole="button" onPress={applyDetected} style={[styles.detected, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="flash" size={14} color={theme.primary} />
                <ThemedText style={[styles.detectedText, { color: theme.primary }]}>
                  {t('task.setTo', {
                    label: [detected.date ? formatDay(locale, detected.date) : null, detected.time ? formatTime(locale, detected.time) : null].filter(Boolean).join(' · '),
                  })}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.detectedHint}>{t('task.tapToApply')}</ThemedText>
              </Pressable>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.tip}>{isEditMode ? t('task.tipEdit') : t('task.tipNew')}</ThemedText>
            )}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('task.descriptionPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={t('task.descriptionLabel')}
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
                {isPast ? t('task.inThePast') : formatDay(locale, dueDate)}
              </ThemedText>
            }>
            <ThemedText themeColor="textSecondary" style={styles.label}>{t('task.day')}</ThemedText>
            <View style={styles.wrap}>
              <Chip label={t('dates.today')} active={dueDate === today} onPress={() => setDueDate(today)} />
              <Chip label={t('dates.tomorrow')} active={dueDate === addLocalDays(today, 1)} onPress={() => setDueDate(addLocalDays(today, 1))} />
              {HAS_NATIVE_PICKER ? (
                <Chip
                  icon="calendar"
                  label={dueDate === today || dueDate === addLocalDays(today, 1) ? t('task.pickDate') : formatDay(locale, dueDate)}
                  active={dueDate !== today && dueDate !== addLocalDays(today, 1)}
                  onPress={() => openPicker('due')}
                />
              ) : null}
            </View>
            <ThemedText themeColor="textSecondary" style={styles.label}>{t('task.time')}</ThemedText>
            <View style={styles.wrap}>
              <Chip icon="sunny-outline" label={t('task.anytime')} active={anytime} onPress={() => setStartTime('')} />
              {HAS_NATIVE_PICKER ? (
                <Chip icon="time-outline" label={anytime ? t('task.pickTime') : formatTime(locale, startTime)} active={!anytime} onPress={() => openPicker('start')} />
              ) : (
                <Chip icon="time-outline" label="09:00" active={startTime === '09:00'} onPress={() => setStartTime('09:00')} />
              )}
            </View>
            {anytime ? <ThemedText themeColor="textSecondary" style={styles.helper}>{t('task.anytimeHint')}</ThemedText> : null}

            <View style={[styles.load, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.loadHead}>
                <ThemedText themeColor="textSecondary" style={styles.loadText}>
                  {dayLoad
                    ? t('task.loadPlanned', { day: formatDay(locale, dueDate), duration: formatDuration(locale, dayLoad) })
                    : t('task.loadNothing', { day: formatDay(locale, dueDate) })}
                </ThemedText>
                <ThemedText style={[styles.loadText, { color: loadColor }]}>
                  {loadAfter > 8 * 60 ? t('task.loadOverloaded') : loadAfter > 5 * 60 ? t('task.loadBusy') : t('task.loadLight')}
                </ThemedText>
              </View>
              <View style={[styles.loadTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.loadFill, { width: `${Math.min(100, (loadAfter / (10 * 60)) * 100)}%`, backgroundColor: loadColor }]} />
              </View>
            </View>

            {overlaps.length ? (
              <View accessibilityRole="alert" style={[styles.warning, { borderColor: theme.warning }]}>
                <Ionicons name="warning-outline" size={16} color={theme.warning} />
                <ThemedText style={styles.warningText}>{t('task.overlap', { titles: overlaps.map((task) => `“${task.title}”`).join(', ') })}</ThemedText>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={suggestSlot} style={[styles.slotBtn, { borderColor: theme.primary }]}>
              <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
              <ThemedText style={[styles.slotText, { color: theme.primary }]}>{t('task.findSlot')}</ThemedText>
            </Pressable>
          </Section>

          {deadline ? (
            <View style={[styles.warning, { borderColor: theme.danger }]}>
              <Ionicons name="flag-outline" size={16} color={theme.danger} />
              <ThemedText style={styles.warningText}>
                {deadline.includes('T')
                  ? t('task.deadlineBefore', { day: formatDay(locale, deadline.split('T')[0]), time: formatTime(locale, deadline.split('T')[1]) })
                  : t('task.deadline', { day: formatDay(locale, deadline) })}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel={t('task.removeDeadline')} onPress={() => setDeadline(null)} style={styles.removeDeadline}>
                <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('common.remove')}</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <Section
            icon="hourglass-outline"
            title={t('task.duration')}
            right={<ThemedText themeColor="textSecondary" style={styles.sectionValue}>{minutes ? formatDuration(locale, minutes) : t('task.noDuration')}</ThemedText>}>
            <View style={styles.wrap}>
              <Chip label={t('task.noDuration')} active={minutes === null} onPress={() => setMinutes(null)} />
              {DURATION_PRESETS.map((value) => (
                <Chip key={value} label={formatDuration(locale, value)} active={minutes === value} onPress={() => setMinutes(value)} />
              ))}
              <Chip
                icon="options-outline"
                label={minutes !== null && !(DURATION_PRESETS as readonly number[]).includes(minutes) ? formatDuration(locale, minutes) : t('task.customDuration')}
                active={minutes !== null && !(DURATION_PRESETS as readonly number[]).includes(minutes)}
                onPress={() => setCustomDuration({ hours: Math.floor((minutes ?? 45) / 60), minutes: (minutes ?? 45) % 60 })}
              />
            </View>
            {endTime ? <ThemedText themeColor="textSecondary" style={styles.helper}>{t('task.endsAt', { time: formatTime(locale, endTime) })}</ThemedText> : null}
            {errors.duration ? <ThemedText style={[styles.fieldError, { color: theme.danger }]}>{errors.duration}</ThemedText> : null}
          </Section>

          <Section icon="flag-outline" title={t('priority.label')}>
            <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
              {(['low', 'medium', 'high'] as const).map((id) => {
                const active = priority === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPriority(id)}
                    style={[styles.segmentItem, active && { backgroundColor: theme.card, borderColor: PRIORITY_COLORS[id] }]}>
                    <View style={[styles.dot, { backgroundColor: PRIORITY_COLORS[id] }]} />
                    <ThemedText style={[styles.segmentText, active && { color: PRIORITY_COLORS[id] }]}>{t(`priority.${id}`)}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section
            icon="pricetag-outline"
            title={t('categories.label')}
            right={
              <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push('/categories')}>
                <ThemedText style={[styles.sectionValue, { color: theme.primary }]}>{t('common.edit')}</ThemedText>
              </Pressable>
            }>
            <View style={styles.wrap}>
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  label={nameOf(category.id)}
                  icon={category.icon}
                  color={category.color}
                  active={categoryId === category.id}
                  trailingIcon={!categoryTouched && suggestedCategory === category.id ? 'sparkles' : undefined}
                  accessibilityLabel={!categoryTouched && suggestedCategory === category.id ? `${nameOf(category.id)}, ${t('categories.suggested')}` : undefined}
                  onPress={() => {
                    setCategoryId(category.id);
                    setCategoryTouched(true);
                  }}
                />
              ))}
            </View>
          </Section>

          <Section
            icon="notifications-outline"
            title={t('task.reminder')}
            right={reminderMoment ? <ThemedText themeColor="textSecondary" style={styles.sectionValue}>{t('reminders.customAt', { moment: formatMoment(locale, reminderMoment.toISOString()) })}</ThemedText> : undefined}>
            {settings.remindersEnabled ? (
              <>
                <View style={styles.wrap}>
                  {reminderOptions.map((option) => (
                    <Chip
                      key={option}
                      icon={option === 'custom' ? 'alarm-outline' : undefined}
                      label={option === 'custom' && reminderMoment ? formatMoment(locale, reminderMoment.toISOString()) : t(REMINDER_KEY[option])}
                      active={reminder === option}
                      onPress={() => void chooseReminder(option)}
                    />
                  ))}
                </View>
                {anytime ? <ThemedText themeColor="textSecondary" style={styles.helper}>{t('reminders.anytimeHint')}</ThemedText> : null}
              </>
            ) : (
              <Pressable accessibilityRole="link" onPress={() => router.push('/settings')}>
                <ThemedText themeColor="textSecondary" style={styles.helper}>{t('reminders.off')}</ThemedText>
              </Pressable>
            )}
          </Section>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          {saveError || Object.keys(errors).some((key) => key !== 'title' && key !== 'duration') ? (
            <ThemedText accessibilityRole="alert" style={[styles.fieldError, { color: theme.danger, textAlign: 'center' }]}>
              {saveError ?? Object.entries(errors).find(([key]) => key !== 'title' && key !== 'duration')?.[1]}
            </ThemedText>
          ) : null}
          <ThemedText themeColor="textSecondary" style={styles.summary} numberOfLines={1}>
            {summary}
            {reminder !== 'none' ? ' · 🔔' : ''}
          </ThemedText>
          <PrimaryButton
            label={saving ? t('common.saving') : isEditMode ? t('task.saveChanges') : plannedCount > 1 ? t('task.review', { count: plannedCount }) : t('task.create')}
            disabled={saving}
            onPress={() => void saveTask()}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmingDelete}
        title={t('task.deleteTitle')}
        message={t('task.deleteMessage', { title: taskToEdit?.title ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        busy={deleting}
        onConfirm={() => void removeTask()}
        onCancel={() => setConfirmingDelete(false)}
      />

      <ConfirmDialog
        visible={dayFull !== null}
        title={t('task.dayFull')}
        message={dayFull?.slot
          ? t('task.dayFullMove', { duration: formatDuration(locale, minutes ?? 30), day: formatDay(locale, dueDate), nextDay: formatDay(locale, dayFull.nextDay), time: formatTime(locale, dayFull.slot) })
          : t('task.dayFullBody', { duration: formatDuration(locale, minutes ?? 30), day: formatDay(locale, dueDate) })}
        confirmLabel={dayFull?.slot ? t('task.moveIt') : t('common.ok')}
        cancelLabel={t('task.keepAsIs')}
        hideCancel={!dayFull?.slot}
        onConfirm={() => {
          if (dayFull?.slot) {
            setDueDate(dayFull.nextDay);
            setStartTime(dayFull.slot);
          }
          setDayFull(null);
        }}
        onCancel={() => setDayFull(null)}
      />

      <Modal transparent visible={customDuration !== null} animationType="fade" onRequestClose={() => setCustomDuration(null)}>
        <Pressable style={styles.backdrop} onPress={() => setCustomDuration(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
            <ThemedText style={styles.headerTitle} accessibilityRole="header">{t('task.customDurationTitle')}</ThemedText>
            {customDuration ? (
              <>
                <ThemedText themeColor="textSecondary" style={styles.label}>{t('task.hours')}</ThemedText>
                <View style={styles.wrap}>
                  {Array.from({ length: 13 }, (_, h) => (
                    <Chip key={h} label={String(h)} active={customDuration.hours === h} onPress={() => setCustomDuration({ hours: h, minutes: h === 12 ? 0 : customDuration.minutes })} />
                  ))}
                </View>
                <ThemedText themeColor="textSecondary" style={styles.label}>{t('task.minutesShort')}</ThemedText>
                <View style={styles.wrap}>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <Chip key={m} label={pad(m)} disabled={customDuration.hours === 12 && m > 0} active={customDuration.minutes === m} onPress={() => setCustomDuration({ ...customDuration, minutes: m })} />
                  ))}
                </View>
                <ThemedText style={[styles.helper, { color: isValidCustomDuration(customDuration.hours * 60 + customDuration.minutes) ? theme.textSecondary : theme.danger }]}>
                  {formatDuration(locale, customDuration.hours * 60 + customDuration.minutes) || '0'} · {t('task.durationRange')}
                </ThemedText>
                <PrimaryButton
                  label={t('common.done')}
                  disabled={!isValidCustomDuration(customDuration.hours * 60 + customDuration.minutes)}
                  onPress={() => {
                    const total = Math.min(DURATION_MAX, Math.max(DURATION_MIN, customDuration.hours * 60 + customDuration.minutes));
                    setMinutes(total);
                    setCustomDuration(null);
                  }}
                />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS === 'ios' ? (
        <Modal transparent visible={iosPicker !== null} animationType="fade" onRequestClose={() => setIosPicker(null)}>
          <Pressable style={styles.backdrop} onPress={() => setIosPicker(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              {iosPicker ? (
                <DateTimePicker
                  value={iosPicker.target === 'reminder' ? (reminderAt && localDateTime(reminderAt)) || dateAt(dueDate, startTime || '09:00') : dateAt(dueDate, startTime)}
                  mode={iosPicker.mode}
                  display={iosPicker.mode === 'date' ? 'inline' : 'spinner'}
                  onChange={(_event, selected) => {
                    if (selected) apply(iosPicker.target, selected, iosPicker.mode);
                  }}
                />
              ) : null}
              <PrimaryButton label={t('common.done')} onPress={() => setIosPicker(null)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
      {permission.dialogs}
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
  form: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  titleCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  titleInput: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', paddingVertical: 4, minHeight: 36, maxHeight: 260, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, fontFamily: 'Poppins_500Medium' },
  detected: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  detectedText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  detectedHint: { fontSize: 11 },
  tip: { fontSize: 11 },
  notesInput: { fontFamily: 'Poppins_400Regular', fontSize: 14, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, minHeight: 40, textAlignVertical: 'top' },
  section: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  sectionValue: { fontSize: 12, fontFamily: 'Poppins_500Medium', flexShrink: 1, textAlign: 'right' },
  label: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginBottom: -4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  load: { borderRadius: 12, padding: 10, gap: 6 },
  loadHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  loadText: { fontSize: 12, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  loadTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  loadFill: { height: 6, borderRadius: 3 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  warningText: { flex: 1, fontSize: 12 },
  removeDeadline: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  slotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, minHeight: 44 },
  slotText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  helper: { fontSize: 12 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, minHeight: 40, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  summary: { fontSize: 12, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 12 },
});
