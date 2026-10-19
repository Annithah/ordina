/**
 * Tasks: a week strip to pick a day, and that day's tasks — Anytime tasks first, then timed
 * tasks in time order. On today, overdue tasks from earlier days are listed too.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatLongDate, formatMonthYear, weekdayName } from '@/i18n/format';
import { weekRange } from '@/logic/filters';
import { groupByDay, isOverdue } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import { useSettingsStore } from '@/store/settings-store';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { friendlyError } from '@/utils/task-validation';

function dateFromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function TasksScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { tasks, loading, loadError, loadTasks, toggleComplete } = useTasksStore();
  const weekStart = useSettingsStore((s) => s.weekStart);
  const today = localDateKey();
  const [selected, setSelected] = useState(today);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  }, [loadTasks]);

  const onToggle = useCallback((task: Task) => {
    toggleComplete(task.id)
      .then(() => toast.success(task.completed ? t('task.uncompletedToast') : t('task.completedToast')))
      .catch((error) => toast.error(friendlyError(error, t('errors.update'))));
  }, [toggleComplete, t]);

  const days = useMemo(() => {
    const [first] = weekRange(selected, weekStart);
    return Array.from({ length: 7 }, (_, index) => addLocalDays(first, index));
  }, [selected, weekStart]);

  const openByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) if (task.dueDate && !task.completed) counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const day = useMemo(() => groupByDay(tasks.filter((task) => task.dueDate === selected))[0] ?? { anytime: [], timed: [] }, [tasks, selected]);
  const earlierOverdue = useMemo(
    () => (selected === today ? tasks.filter((task) => task.dueDate && task.dueDate < today && isOverdue(task)).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')) : []),
    [tasks, selected, today],
  );
  const dayCount = day.anytime.length + day.timed.length;
  const dayDone = [...day.anytime, ...day.timed].filter((task) => task.completed).length;
  const first = dateFromKey(days[0]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title} accessibilityRole="header">{t('tabs.tasks')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>{formatLongDate(locale, selected)}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('week.addForDay')}
            onPress={() => router.push({ pathname: '/new-task', params: { date: selected } })}
            style={[styles.iconButton, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.weekHead}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('week.previous')} onPress={() => setSelected(addLocalDays(selected, -7))} style={styles.navButton}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.weekTitle}>{formatMonthYear(locale, first.getFullYear(), first.getMonth())}</ThemedText>
          {selected !== today ? (
            <Pressable accessibilityRole="button" onPress={() => setSelected(today)} style={[styles.todayPill, { borderColor: theme.primary }]}>
              <ThemedText style={[styles.todayPillText, { color: theme.primary }]}>{t('week.today')}</ThemedText>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('week.next')} onPress={() => setSelected(addLocalDays(selected, 7))} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {days.map((key) => {
            const date = dateFromKey(key);
            const active = key === selected;
            const open = openByDay.get(key) ?? 0;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t('week.dayLabel', { day: formatLongDate(locale, key), count: open })}
                onPress={() => setSelected(key)}
                style={[styles.day, { backgroundColor: active ? theme.primary : theme.card, borderColor: active || key === today ? theme.primary : theme.border }]}>
                <ThemedText style={[styles.dayName, { color: active ? '#FFFFFF' : theme.textSecondary }]}>{weekdayName(locale, date.getDay(), 'narrow')}</ThemedText>
                <ThemedText style={[styles.dayNumber, { color: active ? '#FFFFFF' : theme.text }]}>{date.getDate()}</ThemedText>
                <View style={[styles.dayDot, { backgroundColor: open ? (active ? '#FFFFFF' : theme.primary) : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>

        {loadError ? (
          <View accessibilityRole="alert" style={[styles.notice, { borderColor: theme.danger }]}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
            <ThemedText style={{ flex: 1 }}>{loadError}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}>
              <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('common.retry')}</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {loading && tasks.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (
          <>
            {earlierOverdue.length ? (
              <View style={styles.section}>
                <ThemedText style={[styles.sectionTitle, { color: theme.danger }]} accessibilityRole="header">{t('week.overdueEarlier')}</ThemedText>
                {earlierOverdue.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} showDay />)}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <ThemedText style={styles.sectionTitle} accessibilityRole="header">{formatDay(locale, selected)}</ThemedText>
                {dayCount ? <ThemedText themeColor="textSecondary" style={styles.count}>{t('week.dayDone', { done: dayDone, total: dayCount })}</ThemedText> : null}
              </View>
              {day.anytime.length ? (
                <View style={styles.anytime}>
                  <Ionicons name="sunny-outline" size={13} color={theme.textSecondary} />
                  <ThemedText themeColor="textSecondary" style={styles.anytimeText}>{t('dates.anytime')}</ThemedText>
                </View>
              ) : null}
              {day.anytime.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}
              {day.timed.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}
              {!dayCount ? (
                <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('week.noTasksDay')}</ThemedText>
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/new-task', params: { date: selected } })} style={[styles.emptyButton, { borderColor: theme.primary }]}>
                    <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('week.addForDay')}</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  subtitle: { fontSize: 13 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  weekTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  todayPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  todayPillText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  week: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 8, gap: 2, minHeight: 64 },
  dayName: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  dayNumber: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12 },
  retry: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  section: { gap: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  count: { fontSize: 12 },
  anytime: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  anytimeText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  empty: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 10, alignItems: 'center' },
  emptyButton: { borderWidth: 1, borderRadius: 14, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
});
