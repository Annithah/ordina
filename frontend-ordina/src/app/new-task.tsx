import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContactActions } from '@/components/contact-actions';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { cancelTaskReminder, scheduleTaskReminder } from '@/services/notifications';
import { useAuthStore } from '@/store/auth-store';
import { useTasksStore, type Category, type Priority, type Task } from '@/store/tasks-store';
import { addLocalDays, localDateKey } from '@/utils/dates';
import {
  detectSchedule,
  durationToMinutes,
  findClashes,
  findFreeSlot,
  formatDuration,
  formatTime12,
  friendlyDay,
  minutesFromTime,
  minutesToDuration,
  plannedMinutes,
  timeFromMinutes,
} from '@/utils/task-planning';
import { DESCRIPTION_MAX, TITLE_MAX, friendlyError, validateTaskForm, type TaskFieldErrors } from '@/utils/task-validation';
import { FEATURES } from '@/config/release';

type IconName = keyof typeof Ionicons.glyphMap;

const CATEGORIES: { id: Category; label: string; icon: IconName; color: string }[] = [
  { id: 'work', label: 'Work', icon: 'briefcase-outline', color: '#5C4DF2' },
  { id: 'personal', label: 'Personal', icon: 'person-outline', color: '#F59E0B' },
  { id: 'health', label: 'Health', icon: 'fitness-outline', color: '#22C55E' },
  { id: 'learning', label: 'Learning', icon: 'school-outline', color: '#3B82F6' },
  { id: 'design', label: 'Creative', icon: 'color-palette-outline', color: '#EC4899' },
  { id: 'database', label: 'Errands', icon: 'cart-outline', color: '#06B6D4' },
];

const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#3B82F6' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'high', label: 'High', color: '#EF4444' },
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
  { minutes: null, label: 'Off' },
  { minutes: 0, label: 'At start' },
  { minutes: 10, label: '10 min before' },
  { minutes: 30, label: '30 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
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

export default function NewTaskScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[]; date?: string; time?: string }>();
  const presetDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const presetTime = typeof params.time === 'string' && /^\d{2}:\d{2}$/.test(params.time) ? params.time : undefined;
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
            <ThemedText style={styles.headerTitle}>Task not found</ThemedText>
            <ThemedText themeColor="textSecondary">It may have been deleted.</ThemedText>
            <View style={{ width: 220 }}>
              <PrimaryButton label="Back to tasks" onPress={() => router.back()} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={theme.primary} />
        )}
      </SafeAreaView>
    );
  }
  return <TaskForm key={taskToEdit?.id ?? 'new'} taskToEdit={taskToEdit} presetDate={presetDate} presetTime={presetTime} />;
}

function TaskForm({ taskToEdit, presetDate, presetTime }: { taskToEdit?: Task; presetDate?: string; presetTime?: string }) {
  const theme = useTheme();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const { tasks, addTask, updateTask, deleteTask } = useTasksStore();
  const isEditMode = Boolean(taskToEdit);

  const [title, setTitle] = useState(taskToEdit?.title ?? '');
  const [notes, setNotes] = useState(taskToEdit?.description ?? '');
  const [priority, setPriority] = useState<Priority>(taskToEdit?.priority ?? 'medium');
  const [category, setCategory] = useState<Category>(taskToEdit?.category ?? 'personal');
  const [dueDate, setDueDate] = useState(taskToEdit?.dueDate ?? presetDate ?? localDateKey());
  const [startTime, setStartTime] = useState(taskToEdit?.startTime ?? presetTime ?? '');
  const [minutes, setMinutes] = useState(durationToMinutes(taskToEdit?.duration ?? '1h'));
  const [repeatId, setRepeatId] = useState(() => {
    if (!taskToEdit) return 'none';
    const repeat = REPEATS.find((item) => item.recurrence === taskToEdit.recurrence
      && (item.rule ?? undefined) === (taskToEdit.recurrence === 'custom' ? taskToEdit.recurrenceRule : undefined));
    return repeat?.id ?? 'none';
  });
  const [reminderLead, setReminderLead] = useState<number | null>(taskToEdit?.reminder ? 10 : null);
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

  const detected = useMemo(() => detectSchedule(title), [title]);
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
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addLocalDays(today, 1) },
    { label: 'Saturday', value: nextWeekday(6) },
    { label: 'Next Monday', value: nextWeekday(1) },
  ];
  const timeOptions = [
    { label: 'Morning', value: '09:00' },
    { label: 'Afternoon', value: '14:00' },
    { label: 'Evening', value: '18:00' },
  ];

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
      'This day is full',
      tomorrowSlot
        ? `There is no ${formatDuration(minutes)} gap left on ${friendlyDay(dueDate)}. ${friendlyDay(nextDay)} at ${formatTime12(tomorrowSlot)} is free.`
        : `There is no ${formatDuration(minutes)} gap left on ${friendlyDay(dueDate)}.`,
      tomorrowSlot
        ? [
          { text: 'Keep as is', style: 'cancel' },
          { text: 'Move it', onPress: () => { setDueDate(nextDay); setStartTime(tomorrowSlot); } },
        ]
        : undefined,
    );
  }

  async function saveTask() {
    if (saving) return;
    const found = validateTaskForm({ title, description: notes, dueDate, startTime, durationMinutes: minutes });
    setErrors(found);
    setSaveError(null);
    if (Object.keys(found).length) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    const repeat = REPEATS.find((item) => item.id === repeatId) ?? REPEATS[0];
    const payload = {
      title: title.trim(),
      description: notes.trim(),
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
    let savedTaskId = taskToEdit?.id;
    try {
      if (taskToEdit) await updateTask(taskToEdit.id, payload);
      else savedTaskId = (await addTask(payload)).id;
    } catch (error: any) {
      setSaving(false);
      const serverErrors = error?.response?.data?.errors;
      if (serverErrors && typeof serverErrors === 'object') setErrors(serverErrors);
      setSaveError(friendlyError(error, 'Unable to save the task. Please try again.'));
      return;
    }

    if (savedTaskId) {
      // The task is saved. Local notifications are best-effort and must never hold up saving.
      const id = savedTaskId;
      const reminder = FEATURES.reminders && reminderLead !== null
        ? (() => {
          const start = dateFromKey(dueDate, startTime || '09:00');
          const when = new Date(start.getTime() - reminderLead * 60_000);
          return scheduleTaskReminder(id, payload.title, when.getTime() > Date.now() ? when : start, {
            body: startTime
              ? `${friendlyDay(dueDate)} at ${formatTime12(startTime)}${contact ? ` · ${contact.name}` : ''}`
              : `Planned for ${friendlyDay(dueDate).toLowerCase()}`,
          });
        })()
        : cancelTaskReminder(id);
      void Promise.resolve(reminder).catch(() => undefined);
    }
    setSaving(false);
    toast.success(isEditMode ? 'Changes saved' : 'Task added to your plan');
    router.back();
  }

  async function removeTask() {
    if (!taskToEdit || deleting) return;
    setDeleting(true);
    try {
      await deleteTask(taskToEdit.id);
      setConfirmingDelete(false);
      toast.success('Task deleted');
      router.back();
    } catch (error) {
      setDeleting(false);
      setConfirmingDelete(false);
      toast.error(friendlyError(error, 'Could not delete the task. Please try again.'));
    }
  }

  const summary = [
    friendlyDay(dueDate),
    startTime ? formatTime12(startTime) : 'Any time',
    formatDuration(minutes),
  ].join(' · ');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{isEditMode ? 'Edit task' : 'New task'}</ThemedText>
        {isEditMode ? (
          <Pressable accessibilityLabel="Delete task" onPress={() => setConfirmingDelete(true)} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
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
              placeholder="What do you need to do?"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Task title"
              autoFocus={!isEditMode}
              maxLength={TITLE_MAX}
              multiline
              style={[styles.titleInput, { color: theme.text }]}
            />
            {errors.title ? (
              <ThemedText accessibilityRole="alert" style={[styles.fieldError, { color: theme.danger }]}>{errors.title}</ThemedText>
            ) : null}
            {detected && (detected.date !== dueDate || (detected.time && detected.time !== startTime)) ? (
              <Pressable onPress={applyDetected} style={[styles.detected, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="flash" size={14} color={theme.primary} />
                <ThemedText style={[styles.detectedText, { color: theme.primary }]}>
                  Set to {detected.label}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.detectedHint}>Tap to apply</ThemedText>
              </Pressable>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.tip}>
                Tip: type “tomorrow at 7am” and ORDINA fills in the time.
              </ThemedText>
            )}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a description (optional)"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Task description"
              maxLength={DESCRIPTION_MAX}
              multiline
              style={[styles.notesInput, { color: theme.text, borderTopColor: theme.border }]}
            />
          </View>

          <Section
            icon="calendar-outline"
            title="When"
            right={
              <ThemedText style={[styles.sectionValue, { color: isPast ? theme.danger : theme.textSecondary }]}>
                {isPast ? 'In the past' : friendlyDay(dueDate)}
              </ThemedText>
            }>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {dateOptions.map((item) => (
                <Chip key={item.label} label={item.label} active={dueDate === item.value} onPress={() => setDueDate(item.value)} />
              ))}
              {HAS_NATIVE_PICKER ? (
                <Chip
                  label={dateOptions.some((item) => item.value === dueDate) ? 'Pick date' : friendlyDay(dueDate)}
                  icon="calendar"
                  active={!dateOptions.some((item) => item.value === dueDate)}
                  onPress={() => openPicker('date')}
                />
              ) : !dateOptions.some((item) => item.value === dueDate) ? (
                <Chip label={friendlyDay(dueDate)} icon="calendar" active onPress={() => undefined} />
              ) : null}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label="Any time" active={!startTime} onPress={() => setStartTime('')} />
              {timeOptions.map((item) => (
                <Chip key={item.label} label={item.label} active={startTime === item.value} onPress={() => setStartTime(item.value)} />
              ))}
              {HAS_NATIVE_PICKER ? (
                <Chip
                  label={startTime && !timeOptions.some((item) => item.value === startTime) ? formatTime12(startTime) : 'Pick time'}
                  icon="time-outline"
                  active={Boolean(startTime) && !timeOptions.some((item) => item.value === startTime)}
                  onPress={() => openPicker('time')}
                />
              ) : startTime && !timeOptions.some((item) => item.value === startTime) ? (
                <Chip label={formatTime12(startTime)} icon="time-outline" active onPress={() => undefined} />
              ) : null}
            </ScrollView>

            <View style={[styles.load, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.loadHead}>
                <ThemedText themeColor="textSecondary" style={styles.loadText}>
                  {friendlyDay(dueDate)}: {formatDuration(dayLoad)} already planned
                </ThemedText>
                <ThemedText style={[styles.loadText, { color: loadColor }]}>
                  {loadAfter > 8 * 60 ? 'Overloaded' : loadAfter > 5 * 60 ? 'Busy' : 'Light'}
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
                  Overlaps with {clashes.map((task) => `“${task.title}”`).join(', ')}
                </ThemedText>
              </View>
            ) : null}
            <Pressable onPress={suggestSlot} style={[styles.slotBtn, { borderColor: theme.primary }]}>
              <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
              <ThemedText style={[styles.slotText, { color: theme.primary }]}>Find a free slot</ThemedText>
            </Pressable>
          </Section>

          {deadline ? (
            <View style={[styles.warning, { borderColor: theme.danger }]}>
              <Ionicons name="flag-outline" size={16} color={theme.danger} />
              <ThemedText style={styles.warningText}>
                Deadline: {friendlyDay(deadline.split('T')[0])}
                {deadline.includes('T') ? `, before ${formatTime12(deadline.split('T')[1])}` : ''}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove deadline" onPress={() => setDeadline(null)} style={styles.removeDeadline}>
                <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>Remove</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <Section icon="hourglass-outline" title="Duration" right={<ThemedText themeColor="textSecondary" style={styles.sectionValue}>{formatDuration(minutes)}</ThemedText>}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {DURATIONS.map((value) => (
                <Chip key={value} label={formatDuration(value)} active={minutes === value} onPress={() => setMinutes(value)} />
              ))}
            </ScrollView>
            {startTime ? (
              <ThemedText themeColor="textSecondary" style={styles.helper}>
                Ends at {formatTime12(timeFromMinutes((minutesFromTime(startTime) ?? 0) + minutes))}
              </ThemedText>
            ) : null}
          </Section>

          <Section icon="flag-outline" title="Priority">
            <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
              {PRIORITIES.map((item) => {
                const active = priority === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setPriority(item.id)}
                    style={[styles.segmentItem, active && { backgroundColor: theme.card, borderColor: item.color }]}>
                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                    <ThemedText style={[styles.segmentText, active && { color: item.color }]}>{item.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section icon="pricetag-outline" title="Category">
            <View style={styles.wrap}>
              {CATEGORIES.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  color={item.color}
                  active={category === item.id}
                  onPress={() => setCategory(item.id)}
                />
              ))}
            </View>
          </Section>

          {FEATURES.reminders ? <Section icon="notifications-outline" title="Reminder">
            <View style={styles.wrap}>
              {REMINDERS.map((item) => (
                <Chip key={item.label} label={item.label} active={reminderLead === item.minutes} onPress={() => setReminderLead(item.minutes)} />
              ))}
            </View>
          </Section> : null}

          <Section icon="repeat-outline" title="Repeat">
            <View style={styles.wrap}>
              {REPEATS.map((item) => (
                <Chip key={item.id} label={item.label} active={repeatId === item.id} onPress={() => setRepeatId(item.id)} />
              ))}
            </View>
          </Section>

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
            label={saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create task'}
            disabled={saving}
            onPress={() => void saveTask()}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this task?"
        message={`“${taskToEdit?.title ?? ''}” will be removed from your plan. This cannot be undone.`}
        confirmLabel="Delete"
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
              <PrimaryButton label="Done" onPress={() => setIosPicker(null)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
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
  titleInput: { fontSize: 20, fontFamily: 'Poppins_600SemiBold', paddingVertical: 4, minHeight: 36 },
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
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontFamily: 'Poppins_500Medium' },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  summary: { fontSize: 12, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 12 },
});
