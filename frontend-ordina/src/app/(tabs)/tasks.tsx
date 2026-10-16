/**
 * ORDINA daily task planning: a greeting with today's summary, a week strip to
 * switch days, and the selected day's tasks in time order with clear status.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrdinaMark } from '@/components/ordina-mark';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { greetingForHour } from '@/utils/date';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { STATUS_LABEL, taskStatus, type TaskStatusLabel } from '@/utils/task-health';
import { durationToMinutes, formatDuration, formatTime12, friendlyDay, minutesFromTime } from '@/utils/task-planning';
import { friendlyError } from '@/utils/task-validation';

const PRIORITY_COLOR: Record<Task['priority'], string> = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' };
const PRIORITY_LABEL: Record<Task['priority'], string> = { high: 'High', medium: 'Medium', low: 'Low' };

function dateFromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `key`. */
function weekStart(key: string) {
  const offset = (dateFromKey(key).getDay() + 6) % 7;
  return addLocalDays(key, -offset);
}

function byStartTime(a: Task, b: Task) {
  const am = minutesFromTime(a.startTime);
  const bm = minutesFromTime(b.startTime);
  if (am === null && bm === null) return a.title.localeCompare(b.title);
  if (am === null) return 1;
  if (bm === null) return -1;
  return am - bm;
}

function deadlineLabel(deadline: string) {
  const [date, time] = deadline.split('T');
  const day = friendlyDay(date);
  if (time) return day === 'Today' ? `Due by ${formatTime12(time)}` : `Due ${day} by ${formatTime12(time)}`;
  return day === 'Today' ? 'Due today' : `Due ${day}`;
}

function statusColor(status: TaskStatusLabel, theme: ReturnType<typeof useTheme>) {
  if (status === 'completed') return theme.success;
  if (status === 'overdue') return theme.danger;
  return theme.primary;
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  const theme = useTheme();
  const status = taskStatus(task);
  const color = statusColor(status, theme);
  const minutes = durationToMinutes(task.duration);
  const time = task.startTime ? formatTime12(task.startTime) : 'Any time';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${time}, ${STATUS_LABEL[status]}. Opens task details.`}
      onPress={() => router.push({ pathname: '/new-task', params: { id: task.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: color, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed }}
        accessibilityLabel={task.completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        onPress={() => onToggle(task)}
        hitSlop={6}
        style={styles.checkTarget}>
        <View style={[styles.checkbox, { borderColor: task.completed ? theme.success : theme.border, backgroundColor: task.completed ? theme.success : 'transparent' }]}>
          {task.completed ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
      </Pressable>
      <View style={styles.rowBody}>
        <ThemedText style={[styles.rowTitle, task.completed && styles.done]} numberOfLines={2}>{task.title}</ThemedText>
        {task.description ? (
          <ThemedText themeColor="textSecondary" style={styles.rowDescription} numberOfLines={1}>{task.description}</ThemedText>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.meta}>{time} · {formatDuration(minutes)}</ThemedText>
          <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[task.priority] }]} />
          <ThemedText themeColor="textSecondary" style={styles.meta}>{PRIORITY_LABEL[task.priority]}</ThemedText>
          {task.deadline ? (
            <>
              <Ionicons name="flag-outline" size={13} color={theme.danger} accessibilityLabel="Deadline" />
              <ThemedText style={[styles.meta, { color: theme.danger }]}>{deadlineLabel(task.deadline)}</ThemedText>
            </>
          ) : null}
          {task.parentTaskId || (task.recurrence && task.recurrence !== 'none') ? (
            <Ionicons name="repeat" size={13} color={theme.textSecondary} accessibilityLabel="Repeating task" />
          ) : null}
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
        <ThemedText style={[styles.badgeText, { color }]}>{STATUS_LABEL[status]}</ThemedText>
      </View>
    </Pressable>
  );
}

export default function TasksScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const { tasks, loading, loadError, loadTasks, toggleComplete } = useTasksStore();
  const today = localDateKey();
  const [selected, setSelected] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // The free server can take up to a minute to wake up: say so instead of showing a silent spinner.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlowLoad(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  const onToggle = useCallback((task: Task) => {
    toggleComplete(task.id)
      .then(() => toast.success(task.completed ? 'Marked as not done' : 'Nice work! Task completed'))
      .catch((error) => toast.error(friendlyError(error, 'Could not update the task. Please try again.')));
  }, [toggleComplete]);

  const days = useMemo(() => {
    const start = weekStart(selected);
    return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
  }, [selected]);

  const openByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.dueDate && !task.completed) counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const dayTasks = useMemo(() => tasks.filter((task) => task.dueDate === selected).sort(byStartTime), [tasks, selected]);
  const earlierOverdue = useMemo(
    () => (selected === today
      ? tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < today).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      : []),
    [tasks, selected, today],
  );
  const undated = useMemo(() => (selected === today ? tasks.filter((task) => !task.dueDate && !task.completed) : []), [tasks, selected, today]);

  const todayTasks = tasks.filter((task) => task.dueDate === today);
  const openToday = todayTasks.filter((task) => !task.completed).length;
  const doneToday = todayTasks.filter((task) => task.completed).length;
  const overdueTotal = tasks.filter((task) => taskStatus(task) === 'overdue').length;
  const name = user?.name?.split(' ')[0];
  const todayLabel = dateFromKey(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedDone = dayTasks.filter((task) => task.completed).length;
  const nothingToShow = dayTasks.length === 0 && earlierOverdue.length === 0 && undated.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.greeting}>{greetingForHour()}{name ? `, ${name}` : ''}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.dateLine}>{todayLabel}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search tasks"
            onPress={() => router.push('/search')}
            style={[styles.iconButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        <View style={[styles.summary, { backgroundColor: theme.primary }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={styles.summaryTitle}>
              {todayTasks.length === 0
                ? 'Nothing planned today yet'
                : openToday === 0
                  ? 'All done for today 🎉'
                  : `${openToday} task${openToday === 1 ? '' : 's'} to go today`}
            </ThemedText>
            <ThemedText style={styles.summaryText}>
              {doneToday} done{overdueTotal ? ` · ${overdueTotal} overdue` : ''}
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plan with ORDINA AI"
            onPress={() => router.push('/ai')}
            style={styles.aiButton}>
            <OrdinaMark size={24} />
            <ThemedText style={[styles.aiButtonText, { color: theme.primary }]}>Plan with AI</ThemedText>
          </Pressable>
        </View>

        <View style={styles.weekHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => setSelected(addLocalDays(selected, -7))} style={styles.navButton}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.weekTitle}>
            {dateFromKey(days[0]).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </ThemedText>
          {selected !== today ? (
            <Pressable accessibilityRole="button" onPress={() => setSelected(today)} style={[styles.todayPill, { borderColor: theme.primary }]}>
              <ThemedText style={[styles.todayPillText, { color: theme.primary }]}>Today</ThemedText>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" onPress={() => setSelected(addLocalDays(selected, 7))} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {days.map((key) => {
            const date = dateFromKey(key);
            const active = key === selected;
            const isToday = key === today;
            const open = openByDay.get(key) ?? 0;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${open ? `, ${open} open tasks` : ''}`}
                onPress={() => setSelected(key)}
                style={[
                  styles.day,
                  { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : isToday ? theme.primary : theme.border },
                ]}>
                <ThemedText style={[styles.dayName, { color: active ? '#FFFFFF' : theme.textSecondary }]}>
                  {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </ThemedText>
                <ThemedText style={[styles.dayNumber, { color: active ? '#FFFFFF' : theme.text }]}>{date.getDate()}</ThemedText>
                <View style={[styles.dayDot, { backgroundColor: open ? (active ? '#FFFFFF' : theme.primary) : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>

        {loadError ? (
          <View style={[styles.notice, { borderColor: theme.danger, backgroundColor: `${theme.danger}12` }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={theme.danger} />
            <ThemedText style={styles.noticeText}>{loadError}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}>
              <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {loading && tasks.length === 0 ? (
          <View style={{ marginTop: 40, alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={theme.primary} />
            {slowLoad ? (
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Waking up the ORDINA server. This can take up to a minute after a quiet period.
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <>
            {earlierOverdue.length ? (
              <View style={styles.section}>
                <ThemedText style={[styles.sectionTitle, { color: theme.danger }]}>Overdue from earlier</ThemedText>
                {earlierOverdue.map((task) => (
                  <View key={task.id} style={{ gap: 4 }}>
                    <ThemedText themeColor="textSecondary" style={styles.fromDay}>{friendlyDay(task.dueDate!)}</ThemedText>
                    <TaskRow task={task} onToggle={onToggle} />
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <ThemedText style={styles.sectionTitle}>{friendlyDay(selected)}</ThemedText>
                {dayTasks.length ? (
                  <ThemedText themeColor="textSecondary" style={styles.sectionCount}>{selectedDone}/{dayTasks.length} done</ThemedText>
                ) : null}
              </View>
              {dayTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}
              {undated.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}
            </View>

            {nothingToShow && !loadError ? (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="sunny-outline" size={36} color={theme.primary} />
                <ThemedText style={styles.emptyTitle}>
                  {selected === today ? 'No tasks for today' : `Nothing planned for ${friendlyDay(selected).toLowerCase()}`}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                  Add one, or ask ORDINA AI to plan your day.
                </ThemedText>
                <View style={styles.emptyActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/new-task', params: { date: selected } })}
                    style={[styles.emptyButton, { backgroundColor: theme.primary }]}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <ThemedText style={[styles.emptyButtonText, { color: '#FFFFFF' }]}>Add a task</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/ai')}
                    style={[styles.emptyButton, { backgroundColor: theme.backgroundSelected }]}>
                    <OrdinaMark size={24} />
                    <ThemedText style={[styles.emptyButtonText, { color: theme.primary }]}>Ask ORDINA AI</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a task for ${friendlyDay(selected)}`}
        onPress={() => router.push({ pathname: '/new-task', params: { date: selected } })}
        style={[styles.fab, { backgroundColor: theme.primary }]}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 22, lineHeight: 30, fontFamily: 'Poppins_700Bold' },
  dateLine: { fontSize: 14 },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  summaryTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  summaryText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  aiButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 14, minHeight: 44 },
  aiButtonText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  todayPillText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  week: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayName: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  dayNumber: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  noticeText: { flex: 1, fontSize: 13, paddingVertical: 10 },
  retry: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  sectionCount: { fontSize: 13 },
  fromDay: { fontSize: 12, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderLeftWidth: 4, borderRadius: 16, paddingRight: 12, paddingVertical: 10, gap: 6, minHeight: 64 },
  checkTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  rowDescription: { fontSize: 13 },
  done: { textDecorationLine: 'line-through', opacity: 0.55 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  meta: { fontSize: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, padding: 24 },
  emptyTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 },
  emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 18, minHeight: 48 },
  emptyButtonText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    boxShadow: '0 6px 16px rgba(92, 77, 242, 0.4)',
  },
});
