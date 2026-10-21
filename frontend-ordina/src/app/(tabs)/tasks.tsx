/**
 * ORDINA Tasks: every task the user has (typed, from the paragraph parser or from ORDINA AI,
 * all from the same store), in Overdue / Today / Tomorrow / Upcoming / No date / Completed,
 * or grouped by category. A calendar strip and month picker jump to a day; search and filters
 * narrow the list; swipe right to complete, left to delete (with Undo); hold to select several.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBadge, CategoryPicker, asIcon, useCategoryName } from '@/components/category-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { OrdinaMark } from '@/components/ordina-mark';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { categoryInfo, categoryRegistry, knownCategory } from '@/features/categories';
import { buildTree, filterTasksByCategories } from '@/features/category-tree';
import { dashboardStatusAt, dashboardTasks, isDashboardFilter, type DashboardFilter } from '@/features/dashboard';
import { groupByCategory, searchTasks } from '@/features/task-filter';
import { buildTaskSections, dateGroupedRows, openTasksByDay, type SectionId, type SectionRow } from '@/features/task-sections';
import { useTheme } from '@/hooks/use-theme';
import { activeLocale, translate } from '@/i18n/translations';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { nameOf, useCategoriesStore } from '@/store/categories-store';
import { useTasksStore, type Priority, type Task } from '@/store/tasks-store';
import { greetingForHour } from '@/utils/date';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { statusLabel, taskStatus, type TaskStatusLabel } from '@/utils/task-health';
import { durationToMinutes, formatDuration, formatTime12, friendlyDay } from '@/utils/task-planning';
import { friendlyError } from '@/utils/task-validation';

const PRIORITY_COLOR: Record<Task['priority'], string> = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' };
const UNDO_MS = 5000;
const DAY_WIDTH = 48;
const DAY_GAP = 6;
/** Days shown in the strip: from the week before the anchor to four weeks after. */
const STRIP_BEFORE = 7;
const STRIP_DAYS = 42;

type ViewMode = 'list' | 'category';
type StatusFilter = 'all' | 'open' | 'done';
type Filters = { status: StatusFilter; priority: Priority | null; categories: string[] };

const NO_FILTERS: Filters = { status: 'all', priority: null, categories: [] };

const SECTION_LABEL: Record<SectionId, string> = {
  overdue: 'tasksTab.overdue',
  today: 'task.today',
  tomorrow: 'task.tomorrow',
  upcoming: 'tasksTab.upcoming',
  noDate: 'tasksTab.noDate',
  completed: 'tasksTab.completed',
};

function dateFromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `key`. */
function weekStart(key: string) {
  const offset = (dateFromKey(key).getDay() + 6) % 7;
  return addLocalDays(key, -offset);
}

function deadlineLabel(deadline: string) {
  const [date, time] = deadline.split('T');
  const isToday = date === localDateKey();
  const day = friendlyDay(date);
  if (time) return isToday ? translate('tasksTab.dueBy', { time: formatTime12(time) }) : translate('tasksTab.dueDayBy', { day, time: formatTime12(time) });
  return isToday ? translate('tasksTab.dueToday') : translate('tasksTab.dueDay', { day });
}

function statusColor(status: TaskStatusLabel, theme: ReturnType<typeof useTheme>) {
  if (status === 'completed') return theme.success;
  if (status === 'overdue') return theme.danger;
  return theme.primary;
}

function longDay(key: string, locale: string) {
  return dateFromKey(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

type RowProps = {
  task: Task;
  selecting: boolean;
  selected: boolean;
  showDate: boolean;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onSelect: (task: Task) => void;
};

const TaskRow = memo(function TaskRow({ task, selecting, selected, showDate, onToggle, onDelete, onSelect }: RowProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const swipe = useRef<SwipeableMethods>(null);
  const status = taskStatus(task);
  const started = dashboardStatusAt(task) === 'inProgress';
  const color = started ? theme.warning : statusColor(status, theme);
  const badge = started ? t('home.inProgress') : statusLabel(status);
  const minutes = durationToMinutes(task.duration);
  const time = task.startTime ? formatTime12(task.startTime) : t('task.anytime');

  const card = (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${task.title}, ${task.dueDate ? `${longDay(task.dueDate, locale)}, ` : ''}${time}, ${badge}. ${t('tasksTab.opensDetails')}`}
      accessibilityActions={[{ name: 'complete', label: t('tasksTab.complete') }, { name: 'delete', label: t('tasksTab.delete') }]}
      onAccessibilityAction={(event) => (event.nativeEvent.actionName === 'delete' ? onDelete(task) : onToggle(task))}
      onPress={() => (selecting ? onSelect(task) : router.push({ pathname: '/new-task', params: { id: task.id } }))}
      onLongPress={() => onSelect(task)}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.card,
          borderColor: selected ? theme.primary : theme.border,
          borderLeftColor: categoryInfo(task.category).color,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selecting ? selected : task.completed }}
        accessibilityLabel={translate(task.completed ? 'tasksTab.markNotDone' : 'tasksTab.markDone', { title: task.title })}
        onPress={() => (selecting ? onSelect(task) : onToggle(task))}
        hitSlop={6}
        style={styles.checkTarget}>
        {selecting ? (
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? theme.primary : theme.textSecondary} />
        ) : (
          <View style={[styles.checkbox, { borderColor: task.completed ? theme.success : theme.border, backgroundColor: task.completed ? theme.success : 'transparent' }]}>
            {task.completed ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
          </View>
        )}
      </Pressable>
      <View style={styles.rowBody}>
        <ThemedText style={[styles.rowTitle, task.completed && styles.done]} numberOfLines={2}>{task.title}</ThemedText>
        {task.description ? (
          <ThemedText themeColor="textSecondary" style={styles.rowDescription} numberOfLines={1}>{task.description}</ThemedText>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.meta}>
            {showDate && task.dueDate ? `${longDay(task.dueDate, locale)} · ` : ''}{time} · {formatDuration(minutes)}
          </ThemedText>
          <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[task.priority] }]} />
          <ThemedText themeColor="textSecondary" style={styles.meta}>{t(`task.${task.priority}`)}</ThemedText>
          {task.deadline ? (
            <>
              <Ionicons name="flag-outline" size={13} color={theme.danger} accessibilityLabel={t('tasksTab.deadline')} />
              <ThemedText style={[styles.meta, { color: theme.danger }]}>{deadlineLabel(task.deadline)}</ThemedText>
            </>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <CategoryBadge id={task.category} compact />
          {task.parentTaskId || (task.recurrence && task.recurrence !== 'none') ? (
            <Ionicons name="repeat" size={13} color={theme.textSecondary} accessibilityLabel={t('tasksTab.repeating')} />
          ) : null}
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
        <ThemedText style={[styles.badgeText, { color }]}>{badge}</ThemedText>
      </View>
    </Pressable>
  );

  if (selecting) return card;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      leftThreshold={72}
      rightThreshold={72}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <View style={[styles.swipeAction, styles.swipeLeft, { backgroundColor: theme.success }]}>
          <Ionicons name={task.completed ? 'arrow-undo' : 'checkmark-done'} size={22} color="#FFFFFF" />
          <ThemedText style={styles.swipeText}>{task.completed ? t('tasksTab.notDone') : t('tasksTab.complete')}</ThemedText>
        </View>
      )}
      renderRightActions={() => (
        <View style={[styles.swipeAction, styles.swipeRight, { backgroundColor: theme.danger }]}>
          <ThemedText style={styles.swipeText}>{t('tasksTab.delete')}</ThemedText>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
        </View>
      )}
      onSwipeableOpen={(direction) => {
        swipe.current?.close();
        if (direction === 'right') onToggle(task);
        else onDelete(task);
      }}>
      {card}
    </ReanimatedSwipeable>
  );
});

/** The Home dashboard card each filter came from: its label and empty state. */
const DASH_LABEL: Record<DashboardFilter, string> = { completed: 'home.completed', inProgress: 'home.inProgress', overdue: 'home.overdue' };
const DASH_EMPTY: Record<DashboardFilter, string> = {
  completed: 'tasksTab.emptyCompleted',
  inProgress: 'tasksTab.emptyInProgress',
  overdue: 'tasksTab.emptyOverdue',
};

type ListSection = {
  key: string;
  kind: 'status' | 'category' | 'dash';
  id: string;
  count: number;
  pending?: number;
  done?: number;
  collapsed: boolean;
  data: SectionRow<Task>[];
};

export default function TasksScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const { tasks, loading, loadError, loadTasks, toggleComplete, deleteTask } = useTasksStore();
  const categories = useCategoriesStore((s) => s.categories);
  const moveTasks = useCategoriesStore((s) => s.moveTasks);
  const categoryName = useCategoryName();
  const params = useLocalSearchParams<{ category?: string; date?: string; status?: string; at?: string }>();
  const today = localDateKey();

  const [mode, setMode] = useState<ViewMode>('list');
  // Opened from a Home dashboard card: Completed, In progress or Overdue.
  const [dashFilter, setDashFilter] = useState<DashboardFilter | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [iosPicker, setIosPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['status:completed']));
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [movePicker, setMovePicker] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const stripRef = useRef<ScrollView>(null);
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const selecting = selected.size > 0;

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Opened from a dashboard card, a category or with a date: show exactly that (once per new link).
  const linkKey = `${params.category ?? ''}|${params.date ?? ''}|${params.status ?? ''}|${params.at ?? ''}`;
  const [appliedLink, setAppliedLink] = useState('|||');
  if (linkKey !== appliedLink) {
    setAppliedLink(linkKey);
    const category = knownCategory(params.category);
    if (category) setFilters({ ...NO_FILTERS, categories: [category] });
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setDay(params.date);
    if (isDashboardFilter(params.status)) {
      // Exactly the card's tasks: the same list the Home count comes from.
      setDashFilter(params.status);
      setFilters(NO_FILTERS);
      setQuery('');
      setDay(null);
      setMode('list');
    }
  }

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlowLoad(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Leaving the screen: deletes waiting for Undo happen now, as the user asked.
  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        void deleteTask(id).catch(() => undefined);
      }
      pending.clear();
    };
  }, [deleteTask]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTasks(), useCategoriesStore.getState().load()]);
    setRefreshing(false);
  }, [loadTasks]);

  const onToggle = useCallback((task: Task) => {
    toggleComplete(task.id)
      .then(() => toast.success(task.completed ? t('tasksTab.markedNotDone') : t('tasksTab.completedToast')))
      .catch((error) => toast.error(friendlyError(error, t('home.updateFailed'))));
  }, [toggleComplete, t]);

  /** Hides the tasks now and deletes them after a few seconds unless the user taps Undo. */
  const deleteWithUndo = useCallback((ids: string[]) => {
    setHidden((current) => new Set([...current, ...ids]));
    for (const id of ids) {
      const timer = setTimeout(() => {
        pendingDeletes.current.delete(id);
        deleteTask(id)
          .catch((error) => {
            toast.error(friendlyError(error, t('home.updateFailed')));
          })
          .finally(() => setHidden((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          }));
      }, UNDO_MS);
      pendingDeletes.current.set(id, timer);
    }
    toast.action(ids.length === 1 ? t('tasksTab.deletedOne') : t('tasksTab.deletedMany', { n: ids.length }), {
      label: t('tasksTab.undo'),
      duration: UNDO_MS,
      onPress: () => {
        for (const id of ids) {
          clearTimeout(pendingDeletes.current.get(id));
          pendingDeletes.current.delete(id);
        }
        setHidden((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
      },
    });
  }, [deleteTask, t]);

  const onDelete = useCallback((task: Task) => deleteWithUndo([task.id]), [deleteWithUndo]);

  const onSelect = useCallback((task: Task) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }, []);

  const visibleTasks = useMemo(() => tasks.filter((task) => !hidden.has(task.id)), [tasks, hidden]);

  const filtered = useMemo(() => {
    const base = dashFilter ? dashboardTasks(visibleTasks, dashFilter) : visibleTasks;
    let list = searchTasks(base, query, categoryName);
    if (filters.status !== 'all') list = list.filter((task) => (filters.status === 'done' ? task.completed : !task.completed));
    if (filters.priority) list = list.filter((task) => task.priority === filters.priority);
    list = filterTasksByCategories(list, filters.categories, categoryRegistry());
    if (day) list = list.filter((task) => task.dueDate === day);
    return list;
    // categories: the registry changes with them.
  }, [visibleTasks, dashFilter, query, filters, day, categoryName, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo<ListSection[]>(() => {
    if (mode === 'list' && dashFilter) {
      // Already in the card's order (completed newest first, overdue oldest first, in progress soonest first).
      return filtered.length
        ? [{ key: `dash:${dashFilter}`, kind: 'dash', id: dashFilter, count: filtered.length, collapsed: false, data: dateGroupedRows(filtered) }]
        : [];
    }
    if (mode === 'list') {
      return buildTaskSections(filtered, { today, isOverdue: (task) => taskStatus(task) === 'overdue' }).map((section) => {
        const key = `status:${section.id}`;
        const isCollapsed = collapsed.has(key) && !day;
        return { key, kind: 'status', id: section.id, count: section.count, collapsed: isCollapsed, data: isCollapsed ? [] : section.data };
      });
    }
    const ordered = [...filtered].sort((a, b) => Number(a.completed) - Number(b.completed)
      || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
    return groupByCategory(ordered).map((group) => {
      const key = `category:${group.category}`;
      const isCollapsed = collapsed.has(key);
      return {
        key,
        kind: 'category',
        id: group.category,
        count: group.tasks.length,
        pending: group.pending,
        done: group.done,
        collapsed: isCollapsed,
        data: isCollapsed ? [] : group.tasks.map((task) => ({ kind: 'task' as const, key: task.id, task })),
      };
    });
  }, [filtered, mode, dashFilter, today, collapsed, day]);

  const filterCount = (filters.status !== 'all' ? 1 : 0) + (filters.priority ? 1 : 0) + filters.categories.length;
  const narrowed = filterCount > 0 || query.trim().length > 0 || Boolean(day) || Boolean(dashFilter);
  const dashColor = dashFilter === 'completed' ? theme.success : dashFilter === 'overdue' ? theme.danger : theme.warning;

  const stripAnchor = weekStart(day ?? today);
  const stripDays = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, index) => addLocalDays(stripAnchor, index - STRIP_BEFORE)), [stripAnchor]);
  const dots = useMemo(() => openTasksByDay(visibleTasks), [visibleTasks]);

  useEffect(() => {
    const index = stripDays.indexOf(day ?? today);
    if (index < 0) return;
    const timer = setTimeout(() => stripRef.current?.scrollTo({ x: Math.max(0, index - 2) * (DAY_WIDTH + DAY_GAP), animated: true }), 50);
    return () => clearTimeout(timer);
  }, [stripDays, day, today]);

  function openMonth() {
    const value = dateFromKey(day ?? today);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        onChange: (event: DateTimePickerEvent, chosen?: Date) => {
          if (event.type === 'set' && chosen) setDay(localDateKey(chosen));
        },
      });
      return;
    }
    setIosPicker(true);
  }

  function toggleSection(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function bulkComplete() {
    const chosen = visibleTasks.filter((task) => selected.has(task.id) && !task.completed);
    setSelected(new Set());
    try {
      for (const task of chosen) await toggleComplete(task.id);
      toast.success(t('tasksTab.completedCount', { n: chosen.length }));
    } catch (error) {
      toast.error(friendlyError(error, t('home.updateFailed')));
    }
  }

  async function bulkMove(categoryId: string) {
    const ids = [...selected];
    setMovePicker(false);
    setSelected(new Set());
    try {
      await moveTasks(ids, categoryId);
      toast.success(t('tasksTab.movedCount', { n: ids.length, category: categoryName(categoryId) }));
    } catch (error) {
      toast.error(friendlyError(error, t('home.updateFailed')));
    }
  }

  const todayTasks = visibleTasks.filter((task) => task.dueDate === today);
  const openToday = todayTasks.filter((task) => !task.completed).length;
  const doneToday = todayTasks.filter((task) => task.completed).length;
  const overdueTotal = visibleTasks.filter((task) => taskStatus(task) === 'overdue').length;
  const name = user?.name?.split(' ')[0];
  const todayLabel = dateFromKey(today).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.greeting}>{greetingForHour()}{name ? `, ${name}` : ''}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.dateLine}>{todayLabel}</ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('categories.manageTitle')}
          onPress={() => router.push('/categories')}
          style={[styles.iconButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="pricetags-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('tasksTab.searchPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('tasksTab.searchTasks')}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query ? (
            <Pressable accessibilityLabel={t('common.close')} hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasksTab.filtersTitle')}
          onPress={() => setFiltersOpen(true)}
          style={[styles.filterButton, { backgroundColor: filterCount ? theme.primary : theme.card, borderColor: filterCount ? theme.primary : theme.border }]}>
          <Ionicons name="options-outline" size={20} color={filterCount ? '#FFFFFF' : theme.text} />
          {filterCount ? <ThemedText style={styles.filterCount}>{filterCount}</ThemedText> : null}
        </Pressable>
      </View>

      {dashFilter ? (
        <View style={styles.activeFilters}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tasksTab.clearDashFilter', { status: t(DASH_LABEL[dashFilter]) })}
            onPress={() => setDashFilter(null)}
            style={[styles.activeChip, styles.dashChip, { backgroundColor: `${dashColor}1F`, borderColor: dashColor }]}>
            <View style={[styles.dot, { backgroundColor: dashColor, marginLeft: 0 }]} />
            <ThemedText style={[styles.activeChipText, { color: dashColor, fontFamily: 'Poppins_600SemiBold' }]}>
              {t(DASH_LABEL[dashFilter])} · {filtered.length}
            </ThemedText>
            <Ionicons name="close" size={15} color={dashColor} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.summary, { backgroundColor: theme.primary }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={styles.summaryTitle}>
            {todayTasks.length === 0
              ? t('tasksTab.nothingToday')
              : openToday === 0
                ? t('tasksTab.allDone')
                : openToday === 1
                  ? t('tasksTab.toGoOne')
                  : t('tasksTab.toGo', { n: openToday })}
          </ThemedText>
          <ThemedText style={styles.summaryText}>
            {t('tasksTab.doneCount', { n: doneToday })}{overdueTotal ? ` · ${t('tasksTab.overdueCount', { n: overdueTotal })}` : ''}
          </ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('tasksTab.planWithAi')} onPress={() => router.push('/ai')} style={styles.aiButton}>
          <OrdinaMark size={24} />
          <ThemedText style={[styles.aiButtonText, { color: theme.primary }]}>{t('tasksTab.planWithAi')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.stripHead}>
        <ThemedText style={styles.weekTitle}>{dateFromKey(day ?? today).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasksTab.pickDate')}
          onPress={openMonth}
          style={[styles.monthButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="calendar-outline" size={16} color={theme.primary} />
          <ThemedText style={[styles.monthText, { color: theme.primary }]}>{t('tasksTab.pickDate')}</ThemedText>
        </Pressable>
      </View>
      <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {stripDays.map((key) => {
          const date = dateFromKey(key);
          const active = key === day;
          const isToday = key === today;
          const open = dots.get(key) ?? 0;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}${open ? `, ${t('tasksTab.openTasks', { n: open })}` : ''}`}
              onPress={() => setDay(active ? null : key)}
              style={[
                styles.day,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active || isToday ? theme.primary : theme.border },
              ]}>
              <ThemedText style={[styles.dayName, { color: active ? '#FFFFFF' : theme.textSecondary }]}>
                {date.toLocaleDateString(activeLocale(), { weekday: 'narrow' })}
              </ThemedText>
              <ThemedText style={[styles.dayNumber, { color: active ? '#FFFFFF' : theme.text }]}>{date.getDate()}</ThemedText>
              <View style={[styles.dayDot, { backgroundColor: open ? (active ? '#FFFFFF' : theme.primary) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
        {(['list', 'category'] as const).map((item) => {
          const active = mode === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setMode(item)}
              style={[styles.segmentItem, active && { backgroundColor: theme.card }]}>
              <Ionicons name={item === 'list' ? 'list-outline' : 'pricetags-outline'} size={16} color={active ? theme.primary : theme.textSecondary} />
              <ThemedText style={[styles.segmentText, { color: active ? theme.primary : theme.textSecondary }]}>
                {item === 'list' ? t('tasksTab.viewList') : t('tasksTab.viewCategory')}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {day || filterCount ? (
        <View style={styles.activeFilters}>
          {day ? (
            <Pressable accessibilityRole="button" onPress={() => setDay(null)} style={[styles.activeChip, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="calendar" size={13} color={theme.primary} />
              <ThemedText style={[styles.activeChipText, { color: theme.primary }]}>{longDay(day, locale)}</ThemedText>
              <Ionicons name="close" size={13} color={theme.primary} />
            </Pressable>
          ) : null}
          {filters.status !== 'all' ? (
            <Pressable accessibilityRole="button" onPress={() => setFilters((f) => ({ ...f, status: 'all' }))} style={[styles.activeChip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={[styles.activeChipText, { color: theme.primary }]}>{t(filters.status === 'open' ? 'tasksTab.statusOpen' : 'tasksTab.statusDone')}</ThemedText>
              <Ionicons name="close" size={13} color={theme.primary} />
            </Pressable>
          ) : null}
          {filters.priority ? (
            <Pressable accessibilityRole="button" onPress={() => setFilters((f) => ({ ...f, priority: null }))} style={[styles.activeChip, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[filters.priority], marginLeft: 0 }]} />
              <ThemedText style={[styles.activeChipText, { color: theme.primary }]}>{t(`task.${filters.priority}`)}</ThemedText>
              <Ionicons name="close" size={13} color={theme.primary} />
            </Pressable>
          ) : null}
          {filters.categories.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => setFilters((f) => ({ ...f, categories: f.categories.filter((item) => item !== id) }))}
              style={[styles.activeChip, { backgroundColor: `${categoryInfo(id).color}1F` }]}>
              <Ionicons name={asIcon(categoryInfo(id).icon)} size={13} color={categoryInfo(id).color} />
              <ThemedText style={[styles.activeChipText, { color: categoryInfo(id).color }]}>{categoryName(id)}</ThemedText>
              <Ionicons name="close" size={13} color={categoryInfo(id).color} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {loadError ? (
        <View style={[styles.notice, { borderColor: theme.danger, backgroundColor: `${theme.danger}12` }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={theme.danger} />
          <ThemedText style={styles.noticeText}>{loadError}</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}>
            <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('common.tryAgain')}</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const onlyDash = Boolean(dashFilter) && !filterCount && !query.trim() && !day;
  const empty = loading && tasks.length === 0 ? (
    <View style={styles.loadingBox}>
      <ActivityIndicator color={theme.primary} />
      {slowLoad ? <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('tasksTab.wakingServer')}</ThemedText> : null}
    </View>
  ) : loadError ? null : (
    <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Ionicons
        name={onlyDash ? (dashFilter === 'overdue' ? 'trophy-outline' : 'sunny-outline') : narrowed ? (day ? 'sunny-outline' : 'funnel-outline') : 'sparkles-outline'}
        size={36}
        color={onlyDash ? dashColor : theme.primary}
      />
      <ThemedText style={styles.emptyTitle}>
        {onlyDash
          ? t(DASH_EMPTY[dashFilter!])
          : day && !filterCount && !query.trim()
            ? t('tasksTab.nothingPlanned', { day: friendlyDay(day) })
            : narrowed ? t('tasksTab.noTasksFilter') : t('tasksTab.noTasksYet')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyText}>
        {onlyDash ? t('tasksTab.emptyDashHint') : narrowed ? t('tasksTab.noTasksFilterHint') : t('tasksTab.emptyHint')}
      </ThemedText>
      <View style={styles.emptyActions}>
        {narrowed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFilters(NO_FILTERS);
              setQuery('');
              setDay(null);
              setDashFilter(null);
            }}
            style={[styles.emptyButton, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={[styles.emptyButtonText, { color: theme.primary }]}>{dashFilter ? t('tasksTab.showAllTasks') : t('tasksTab.clearFilters')}</ThemedText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/new-task', params: { date: day ?? today } })}
          style={[styles.emptyButton, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <ThemedText style={[styles.emptyButtonText, { color: '#FFFFFF' }]}>{t('tasksTab.addTask')}</ThemedText>
        </Pressable>
        {!narrowed ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/ai')} style={[styles.emptyButton, { backgroundColor: theme.backgroundSelected }]}>
            <OrdinaMark size={24} />
            <ThemedText style={[styles.emptyButtonText, { color: theme.primary }]}>{t('tasksTab.askAi')}</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <SectionList<SectionRow<Task>, ListSection>
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        initialNumToRender={20}
        windowSize={11}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}
        renderSectionHeader={({ section }) => {
          const info = section.kind === 'category' ? categoryInfo(section.id) : null;
          const title = info
            ? categoryName(section.id)
            : section.kind === 'dash' ? t(DASH_LABEL[section.id as DashboardFilter]) : t(SECTION_LABEL[section.id as SectionId]);
          const tint = section.kind === 'dash' ? dashColor : section.id === 'overdue' ? theme.danger : info?.color ?? theme.text;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !section.collapsed }}
              accessibilityLabel={`${title}, ${section.count}. ${section.collapsed ? t('tasksTab.expand') : t('tasksTab.collapse')}`}
              onPress={() => toggleSection(section.key)}
              style={[styles.sectionHead, info && { borderLeftColor: info.color, borderLeftWidth: 3, paddingLeft: 8 }]}>
              {info ? (
                <View style={[styles.sectionIcon, { backgroundColor: `${info.color}1F` }]}>
                  <Ionicons name={asIcon(info.icon)} size={15} color={info.color} />
                </View>
              ) : null}
              <ThemedText style={[styles.sectionTitle, { color: tint }]} numberOfLines={1}>{title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.sectionCount}>
                {section.kind === 'category'
                  ? t('tasksTab.pendingDone', { pending: section.pending ?? 0, done: section.done ?? 0 })
                  : section.count}
              </ThemedText>
              <Ionicons name={section.collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={theme.textSecondary} />
            </Pressable>
          );
        }}
        renderItem={({ item, section }) => {
          if (item.kind === 'day') {
            return <ThemedText themeColor="textSecondary" style={styles.subHead}>{longDay(item.date, locale)}</ThemedText>;
          }
          if (item.kind === 'noDate') {
            return <ThemedText themeColor="textSecondary" style={styles.subHead}>{t('tasksTab.noDate')}</ThemedText>;
          }
          if (item.kind === 'anytime' || item.kind === 'scheduled') {
            return <ThemedText themeColor="textSecondary" style={styles.subHead}>{item.kind === 'anytime' ? t('task.anytime') : t('tasksTab.scheduled')}</ThemedText>;
          }
          if (item.kind !== 'task') return null;
          return (
            <TaskRow
              task={item.task}
              selecting={selecting}
              selected={selected.has(item.task.id)}
              showDate={section.kind === 'category'}
              onToggle={onToggle}
              onDelete={onDelete}
              onSelect={onSelect}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 6 }} />}
      />

      {selecting ? (
        <View style={[styles.bulkBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => setSelected(new Set())} style={styles.bulkClose}>
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.bulkCount}>{t('tasksTab.selectedCount', { n: selected.size })}</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => void bulkComplete()} style={styles.bulkAction}>
            <Ionicons name="checkmark-done" size={20} color={theme.success} />
            <ThemedText style={styles.bulkText}>{t('tasksTab.complete')}</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setMovePicker(true)} style={styles.bulkAction}>
            <Ionicons name="pricetag-outline" size={20} color={theme.primary} />
            <ThemedText style={styles.bulkText}>{t('tasksTab.move')}</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setConfirmBulkDelete(true)} style={styles.bulkAction}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
            <ThemedText style={styles.bulkText}>{t('tasksTab.delete')}</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasksTab.addTaskFor', { day: friendlyDay(day ?? today) })}
          onPress={() => router.push({ pathname: '/new-task', params: { date: day ?? today } })}
          style={[styles.fab, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      )}

      <CategoryPicker
        visible={movePicker}
        title={t('tasksTab.moveTo')}
        onSelect={(id) => void bulkMove(id)}
        onClose={() => setMovePicker(false)}
      />

      <ConfirmDialog
        visible={confirmBulkDelete}
        title={t('tasksTab.bulkDeleteTitle', { n: selected.size })}
        message={t('tasksTab.bulkDeleteBody')}
        confirmLabel={t('tasksTab.delete')}
        destructive
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          setConfirmBulkDelete(false);
          deleteWithUndo([...selected]);
          setSelected(new Set());
        }}
      />

      <FiltersSheet visible={filtersOpen} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />

      {iosPicker ? (
        <Modal transparent animationType="fade" onRequestClose={() => setIosPicker(false)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setIosPicker(false)}>
            <View style={[styles.pickerCard, { backgroundColor: theme.card }]}>
              <DateTimePicker
                value={dateFromKey(day ?? today)}
                mode="date"
                display="inline"
                onChange={(_event, chosen) => {
                  if (chosen) setDay(localDateKey(chosen));
                  setIosPicker(false);
                }}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

/** Status, priority and categories (choosing a category includes its subcategories). */
function FiltersSheet({ visible, filters, onChange, onClose }: {
  visible: boolean;
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const categories = useCategoriesStore((s) => s.categories);
  const tree = buildTree(categories);

  const toggleCategory = (id: string) => onChange({
    ...filters,
    categories: filters.categories.includes(id) ? filters.categories.filter((item) => item !== id) : [...filters.categories, id],
  });

  const choice = ({ key, label, active, onPress, color }: { key: string; label: string; active: boolean; onPress: () => void; color?: string }) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.choice, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.backgroundSelected : theme.card }]}>
      {color ? <View style={[styles.dot, { backgroundColor: color, marginLeft: 0 }]} /> : null}
      <ThemedText style={[styles.choiceText, { color: active ? theme.primary : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.sheetHead}>
            <ThemedText style={styles.sheetTitle}>{t('tasksTab.filtersTitle')}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => onChange(NO_FILTERS)} hitSlop={8}>
              <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('tasksTab.clearFilters')}</ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
            <ThemedText style={styles.filterLabel}>{t('tasksTab.filterStatus')}</ThemedText>
            <View style={styles.choices}>
              {(['all', 'open', 'done'] as const).map((status) => (
                choice({
                  key: status,
                  label: t(status === 'all' ? 'tasksTab.statusAll' : status === 'open' ? 'tasksTab.statusOpen' : 'tasksTab.statusDone'),
                  active: filters.status === status,
                  onPress: () => onChange({ ...filters, status }),
                })
              ))}
            </View>
            <ThemedText style={styles.filterLabel}>{t('tasksTab.filterPriority')}</ThemedText>
            <View style={styles.choices}>
              {choice({ key: 'any', label: t('tasksTab.priorityAny'), active: !filters.priority, onPress: () => onChange({ ...filters, priority: null }) })}
              {(['high', 'medium', 'low'] as const).map((priority) => (
                choice({
                  key: priority,
                  label: t(`task.${priority}`),
                  color: PRIORITY_COLOR[priority],
                  active: filters.priority === priority,
                  onPress: () => onChange({ ...filters, priority }),
                })
              ))}
            </View>
            <ThemedText style={styles.filterLabel}>{t('tasksTab.filterCategories')}</ThemedText>
            {tree.map((parent) => {
              const parentOn = filters.categories.includes(parent.id);
              return (
                <View key={parent.id} style={{ gap: 6 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: parentOn }} onPress={() => toggleCategory(parent.id)} style={styles.categoryRow}>
                    <Ionicons name={parentOn ? 'checkbox' : 'square-outline'} size={22} color={parentOn ? parent.color : theme.textSecondary} />
                    <Ionicons name={asIcon(parent.icon)} size={16} color={parent.color} />
                    <ThemedText style={styles.categoryRowText}>{nameOf(parent)}</ThemedText>
                  </Pressable>
                  {parent.children.length && !parentOn ? (
                    <View style={[styles.choices, { paddingLeft: 32 }]}>
                      {parent.children.map((child) => (
                        choice({ key: child.id, label: nameOf(child), active: filters.categories.includes(child.id), onPress: () => toggleCategory(child.id) })
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.sheetDone, { backgroundColor: theme.primary }]}>
            <ThemedText style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>{t('common.done')}</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  headerBlock: { gap: 12, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 22, lineHeight: 30, fontFamily: 'Poppins_700Bold' },
  dateLine: { fontSize: 14 },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  summaryTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  summaryText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  aiButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 14, minHeight: 44 },
  aiButtonText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  monthButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  monthText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  strip: { gap: DAY_GAP, paddingRight: 8 },
  day: { width: DAY_WIDTH, minHeight: 64, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayName: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  dayNumber: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, paddingVertical: 8 },
  filterButton: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterCount: { position: 'absolute', top: 4, right: 6, color: '#FFFFFF', fontSize: 10, fontFamily: 'Poppins_700Bold' },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 10 },
  segmentText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, minHeight: 32 },
  dashChip: { borderWidth: 1, minHeight: 36, paddingHorizontal: 12 },
  activeChipText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  noticeText: { flex: 1, fontSize: 13, paddingVertical: 10 },
  retry: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 8 },
  sectionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  sectionCount: { fontSize: 13 },
  subHead: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginLeft: 4, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderLeftWidth: 4, borderRadius: 16, paddingRight: 12, paddingVertical: 10, gap: 6, minHeight: 64 },
  checkTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  rowDescription: { fontSize: 13 },
  done: { textDecorationLine: 'line-through', opacity: 0.55 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  meta: { fontSize: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
  swipeAction: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 20 },
  swipeLeft: { justifyContent: 'flex-start' },
  swipeRight: { justifyContent: 'flex-end' },
  swipeText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  loadingBox: { marginTop: 40, alignItems: 'center', gap: 10 },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, padding: 24, marginTop: 8 },
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
  bulkBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 18,
    padding: 6,
    elevation: 8,
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
  },
  bulkClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bulkCount: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  bulkAction: { alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 48, paddingHorizontal: 4 },
  bulkText: { fontSize: 11 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 16 },
  pickerCard: { borderRadius: 20, padding: 8 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  filterLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 36 },
  choiceText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  categoryRowText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  sheetDone: { borderRadius: 999, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
});
