/**
 * Home: today's summary, the ORDINA AI bar, search and filters, and the matching tasks.
 * - "By time": each day in order, Anytime tasks grouped at the top of the day, then timed ones.
 * - "By category": collapsible category headers with a count, e.g. "Study (3)".
 * Search and filters run in SQLite; the last view and filters are remembered on the phone.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrdinaMark } from '@/components/ordina-mark';
import { TaskFiltersBar } from '@/components/task-filters';
import { TaskRow } from '@/components/task-row';
import { ThemeToggle } from '@/components/theme-toggle';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatLongDate } from '@/i18n/format';
import type { Category } from '@/logic/categories';
import { activeChips, sanitizeFilters, type TaskFilters } from '@/logic/filters';
import { groupByDay, isOverdue } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import { queryLocalTasks } from '@/services/local-tasks';
import { useAuthStore } from '@/store/auth-store';
import { useSettingsStore, type TaskView } from '@/store/settings-store';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { localDateKey } from '@/utils/dates';
import { friendlyError } from '@/utils/task-validation';

type Item =
  | { type: 'day'; key: string; date: string | null; count: number }
  | { type: 'anytime'; key: string }
  | { type: 'category'; key: string; category: Category; count: number; collapsed: boolean }
  | { type: 'task'; key: string; task: Task; showDay: boolean; hideCategory: boolean };

function greetingKey() {
  const hour = new Date().getHours();
  return hour < 12 ? 'greeting.morning' : hour < 17 ? 'greeting.afternoon' : 'greeting.evening';
}

export default function HomeScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const allTasks = useTasksStore((s) => s.tasks);
  const version = useTasksStore((s) => s.version);
  const tasksLoading = useTasksStore((s) => s.loading);
  const toggleComplete = useTasksStore((s) => s.toggleComplete);
  const { categories } = useCategories();
  const settings = useSettingsStore();
  const [filters, setFilters] = useState<TaskFilters>(settings.homeFilters);
  const [view, setView] = useState<TaskView>(settings.homeView ?? settings.defaultView);
  const [collapsed, setCollapsed] = useState<string[]>(settings.collapsedCategories);
  const [results, setResults] = useState<Task[]>([]);
  const [querying, setQuerying] = useState(true);
  const [tick, setTick] = useState(0);

  // Saved filters may point at a category deleted since; settings may finish loading after mount.
  useEffect(() => {
    if (!settings.loaded) return;
    setFilters(sanitizeFilters(settings.homeFilters, categories.length ? categories.map((c) => c.id) : undefined));
    setView(settings.homeView ?? settings.defaultView);
    setCollapsed(settings.collapsedCategories);
    // Only when settings first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.loaded]);

  const changeFilters = useCallback((next: TaskFilters) => {
    setFilters(next);
    void useSettingsStore.getState().update({ homeFilters: next });
  }, []);
  const changeView = (next: TaskView) => {
    setView(next);
    void useSettingsStore.getState().update({ homeView: next });
  };
  const toggleCollapsed = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id];
    setCollapsed(next);
    void useSettingsStore.getState().update({ collapsedCategories: next });
  };

  // Overdue depends on the clock: re-check when the screen comes back into view.
  useFocusEffect(useCallback(() => setTick((value) => value + 1), []));

  useEffect(() => {
    let alive = true;
    setQuerying(true);
    queryLocalTasks(filters, settings.weekStart)
      .then((rows) => {
        if (alive) setResults(rows);
      })
      .catch((error) => toast.error(friendlyError(error, t('errors.load'))))
      .finally(() => {
        if (alive) setQuerying(false);
      });
    return () => {
      alive = false;
    };
  }, [filters, version, settings.weekStart, tick, t]);

  const onToggle = useCallback((task: Task) => {
    toggleComplete(task.id)
      .then(() => toast.success(task.completed ? t('task.uncompletedToast') : t('task.completedToast')))
      .catch((error) => toast.error(friendlyError(error, t('errors.update'))));
  }, [toggleComplete, t]);

  const today = localDateKey();
  const todayTasks = allTasks.filter((task) => task.dueDate === today);
  const openToday = todayTasks.filter((task) => !task.completed).length;
  const doneToday = todayTasks.length - openToday;
  const overdueTotal = allTasks.filter((task) => isOverdue(task)).length;
  const name = isSignedIn ? user?.name?.split(' ')[0] : '';
  const greeting = name ? t('greeting.withName', { greeting: t(greetingKey()), name }) : t(greetingKey());
  const filtering = activeChips(filters).length > 0;

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (view === 'time') {
      for (const group of groupByDay(results)) {
        list.push({ type: 'day', key: `day-${group.date}`, date: group.date, count: group.anytime.length + group.timed.length });
        if (group.anytime.length) {
          list.push({ type: 'anytime', key: `any-${group.date}` });
          for (const task of group.anytime) list.push({ type: 'task', key: task.id, task, showDay: false, hideCategory: false });
        }
        for (const task of group.timed) list.push({ type: 'task', key: task.id, task, showDay: false, hideCategory: false });
      }
      return list;
    }
    const byCategory = new Map<string, Task[]>();
    const known = new Set(categories.map((category) => category.id));
    const fallback = categories[categories.length - 1]?.id;
    for (const task of results) {
      const id = known.has(task.categoryId) ? task.categoryId : fallback;
      if (!id) continue;
      byCategory.set(id, [...(byCategory.get(id) ?? []), task]);
    }
    for (const category of categories) {
      const tasks = byCategory.get(category.id);
      if (!tasks?.length) continue;
      const isCollapsed = collapsed.includes(category.id);
      list.push({ type: 'category', key: `cat-${category.id}`, category, count: tasks.length, collapsed: isCollapsed });
      if (!isCollapsed) for (const task of tasks) list.push({ type: 'task', key: task.id, task, showDay: true, hideCategory: true });
    }
    return list;
  }, [view, results, categories, collapsed]);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.greeting} numberOfLines={2}>{greeting}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.date}>{formatLongDate(locale, today)}</ThemedText>
        </View>
        <ThemeToggle />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.planWithAi')}
        onPress={() => router.push('/ai')}
        style={[styles.aiBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <OrdinaMark size={28} />
        <ThemedText themeColor="textSecondary" style={styles.aiBarText} numberOfLines={1}>{t('home.tellOrdina')}</ThemedText>
        <Ionicons name="sparkles-outline" size={20} color={theme.primary} />
      </Pressable>

      <View style={[styles.summary, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.summaryTitle}>
          {todayTasks.length === 0 ? t('home.nothingToday') : openToday === 0 ? t('home.allDoneToday') : t('home.todaySummary', { count: openToday })}
        </ThemedText>
        <ThemedText style={styles.summaryText}>
          {overdueTotal ? t('home.doneOverdue', { done: doneToday, overdue: overdueTotal }) : t('home.doneOnly', { done: doneToday })}
        </ThemedText>
      </View>

      <TaskFiltersBar filters={filters} onChange={changeFilters} />

      <View style={styles.viewRow}>
        <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {(['time', 'category'] as const).map((id) => {
            const active = view === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => changeView(id)}
                style={[styles.segmentItem, active && { backgroundColor: theme.primary }]}>
                <Ionicons name={id === 'time' ? 'time-outline' : 'pricetags-outline'} size={14} color={active ? '#FFFFFF' : theme.textSecondary} />
                <ThemedText style={[styles.segmentText, { color: active ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                  {id === 'time' ? t('home.viewByTime') : t('home.viewByCategory')}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <ThemedText themeColor="textSecondary" style={styles.count}>{t('home.results', { count: results.length })}</ThemedText>
      </View>
    </View>
  );

  const empty = querying || tasksLoading ? null : (
    <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Ionicons name={filtering ? 'search-outline' : 'checkbox-outline'} size={32} color={theme.primary} />
      <ThemedText style={styles.emptyTitle}>{filtering ? t('home.noMatches') : t('home.noTasksYet')}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyText}>{filtering ? t('home.noMatchesHint') : t('home.noTasksYetHint')}</ThemedText>
      <Pressable accessibilityRole="button" onPress={() => (filtering ? changeFilters({ search: '', categoryIds: [], status: 'all', date: null, from: null, to: null, priorities: [] }) : router.push('/new-task'))} style={[styles.emptyButton, { borderColor: theme.primary }]}>
        <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{filtering ? t('common.clearAll') : t('home.addTask')}</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        windowSize={11}
        renderItem={({ item }) => {
          if (item.type === 'day') {
            return (
              <ThemedText accessibilityRole="header" style={[styles.groupTitle, item.date && item.date < today ? { color: theme.danger } : null]}>
                {item.date ? formatDay(locale, item.date) : t('dates.noDate')}
              </ThemedText>
            );
          }
          if (item.type === 'anytime') {
            return (
              <View style={styles.anytime}>
                <Ionicons name="sunny-outline" size={13} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary" style={styles.anytimeText}>{t('dates.anytime')}</ThemedText>
              </View>
            );
          }
          if (item.type === 'category') {
            const label = categoryName(item.category, t);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !item.collapsed }}
                accessibilityLabel={item.collapsed ? t('home.expand', { name: label }) : t('home.collapse', { name: label })}
                onPress={() => toggleCollapsed(item.category.id)}
                style={[styles.categoryHead, { borderColor: theme.border }]}>
                <View style={[styles.categoryIcon, { backgroundColor: `${item.category.color}22` }]}>
                  <Ionicons name={item.category.icon} size={16} color={item.category.color} />
                </View>
                <ThemedText style={styles.categoryTitle} numberOfLines={1}>{`${label} (${item.count})`}</ThemedText>
                <Ionicons name={item.collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={theme.textSecondary} />
              </Pressable>
            );
          }
          return <TaskRow task={item.task} onToggle={onToggle} showDay={item.showDay} hideCategory={item.hideCategory} />;
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.addTask')}
        onPress={() => router.push('/new-task')}
        style={({ pressed }) => [styles.fab, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 110, width: '100%', maxWidth: 760, alignSelf: 'center' },
  headerBlock: { gap: 14, paddingTop: 8, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 22, lineHeight: 30, fontFamily: 'Poppins_700Bold' },
  date: { fontSize: 13 },
  aiBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 28, paddingHorizontal: 16, minHeight: 52 },
  aiBarText: { flex: 1, fontSize: 15 },
  summary: { borderRadius: 18, padding: 16, gap: 2 },
  summaryTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  summaryText: { color: '#E0E7FF', fontSize: 13 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segment: { flex: 1, flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, minHeight: 40, paddingHorizontal: 6 },
  segmentText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  count: { fontSize: 12 },
  groupTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', marginTop: 14, marginBottom: 8 },
  anytime: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  anytimeText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  categoryHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 10, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyButton: { marginTop: 6, borderWidth: 1, borderRadius: 14, minHeight: 44, paddingHorizontal: 18, justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
});
