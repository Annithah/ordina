import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContactActions } from '@/components/contact-actions';
import { ThemeToggle } from '@/components/theme-toggle';
import { OrdinaMark } from '@/components/ordina-mark';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { asIcon, useCategoryName } from '@/components/category-ui';
import { categoryInfo } from '@/features/categories';
import { dashboardCounts } from '@/features/dashboard';
import { categoryCounts, filterByCategory, groupByCategory } from '@/features/task-filter';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { useProductivityStore } from '@/store/productivity-store';
import { useTasksStore } from '@/store/tasks-store';
import { api } from '@/services/api';
import { localDateKey, addLocalDays } from '@/utils/dates';
import { dashboardStatus, summarize, taskHealth, type DashboardStatus } from '@/utils/task-health';
import { friendlyError } from '@/utils/task-validation';
import { FEATURES } from '@/config/release';

function StatusBar({ counts, colors }: {
  counts: { completed: number; inProgress: number; overdue: number };
  colors: { success: string; warning: string; danger: string; backgroundElement: string };
}) {
  const total = counts.completed + counts.inProgress + counts.overdue;
  if (!total) return <View style={[styles.statusBar, { backgroundColor: colors.backgroundElement }]} />;
  return (
    <View style={[styles.statusBar, { backgroundColor: colors.backgroundElement }]}>
      {counts.completed ? <View style={{ flex: counts.completed, backgroundColor: colors.success }} /> : null}
      {counts.inProgress ? <View style={{ flex: counts.inProgress, backgroundColor: colors.warning }} /> : null}
      {counts.overdue ? <View style={{ flex: counts.overdue, backgroundColor: colors.danger }} /> : null}
    </View>
  );
}

function formatGreeting(t: (path: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t('home.morning');
  if (hour < 17) return t('home.afternoon');
  return t('home.evening');
}

const CARD_LABEL: Record<'completed' | 'inProgress' | 'overdue', string> = {
  completed: 'home.cardCompleted',
  inProgress: 'home.cardInProgress',
  overdue: 'home.cardOverdue',
};

const STATUS_KEY: Record<DashboardStatus, string> = {
  completed: 'home.completed',
  inProgress: 'home.inProgress',
  overdue: 'home.overdue',
  todo: 'home.todo',
};

function statusTint(status: DashboardStatus, theme: { success: string; warning: string; danger: string; textSecondary: string }) {
  if (status === 'completed') return theme.success;
  if (status === 'inProgress') return theme.warning;
  if (status === 'overdue') return theme.danger;
  return theme.textSecondary;
}

function firstName(name: string | null | undefined, fallback: string) {
  if (!name) return fallback;
  return name.split(' ')[0];
}

function monthTitle(date: Date, locale: string) {
  return date.toLocaleString(locale, { month: 'long', year: 'numeric' });
}

/** One-letter weekday names, Monday first, in the app language. */
function weekdayLetters(locale: string) {
  // 5 Oct 2026 is a Monday.
  return Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 5 + index).toLocaleDateString(locale, { weekday: 'narrow' }));
}

export default function HomeScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const user = useAuthStore((s) => s.user);
  const { tasks, loadError, loadErrorDetail, toggleComplete, toggleInProgress, loadTasks } = useTasksStore();
  const {
    goals,
    reminders,
    notifications,
    loadGoals,
    loadReminders,
    loadNotifications,
  } = useProductivityStore();
  const [nextUp, setNextUp] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string | null>(null);

  // Read the saved tasks again whenever Home is shown and whenever the app comes back to the front.
  useFocusEffect(useCallback(() => {
    void loadTasks();
  }, [loadTasks]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadTasks();
    });
    return () => subscription.remove();
  }, [loadTasks]);

  useEffect(() => {
    // Offline mode: goals, reminders, notifications and the server dashboard don't exist.
    if (!FEATURES.serverWorkspace) return;
    void Promise.all([loadGoals(), loadReminders(), loadNotifications()])
      .then(() => setWorkspaceError(false))
      .catch(() => setWorkspaceError(true));
    void api
      .get('/api/dashboard')
      .then(({ data }) => {
        if (data?.recommendation?.title) setNextUp(data.recommendation.title);
      })
      .catch(() => undefined);
  }, [loadTasks, loadGoals, loadReminders, loadNotifications]);

  const today = localDateKey();
  const tomorrow = addLocalDays(today, 1);
  const todaysTasks = tasks.filter((task) => task.dueDate === today);
  // Dashboard: the same function gives these numbers and the lists the cards open on the Tasks page.
  const dash = useMemo(() => dashboardCounts(tasks), [tasks]);
  const upcomingCount = tasks.filter((task) => !task.completed && Boolean(task.dueDate && task.dueDate > today)).length;
  const activeGoals = goals.filter((goal) => !goal.completed && goal.status !== 'archived');
  const activeReminders = reminders.filter(
    (reminder) => reminder.enabled && !reminder.completed && reminder.status !== 'completed',
  );
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const selectedMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const selectedDayTasks = tasks.filter((task) => task.dueDate === selectedDate);
  const selectedDayCompleted = selectedDayTasks.filter((task) => task.completed).length;
  const monthTasks = tasks.filter((task) => task.dueDate?.startsWith(`${selectedMonth}-`));
  const monthLastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthFirstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const monthDays = [
    ...Array.from({ length: monthFirstWeekday }, () => null),
    ...Array.from({ length: monthLastDay }, (_, index) => index + 1),
  ];
  const monthTasksUntil = monthTasks.filter((task) => {
    const currentMonth = today.slice(0, 7);
    return selectedMonth < currentMonth || (selectedMonth === currentMonth && (task.dueDate ?? '') <= today);
  });
  const monthCounts = summarize(monthTasksUntil);
  const monthCompleted = monthCounts.completed;
  const monthPercent = monthTasksUntil.length ? Math.round((monthCompleted / monthTasksUntil.length) * 100) : null;

  const dayPerformance = useMemo(() => {
    const byDate = new Map<string, { total: number; completed: number; inProgress: number; overdue: number }>();
    for (const task of tasks) {
      if (!task.dueDate?.startsWith(`${selectedMonth}-`)) continue;
      const stats = byDate.get(task.dueDate) ?? { total: 0, completed: 0, inProgress: 0, overdue: 0 };
      const health = taskHealth(task);
      stats.total += 1;
      if (health === 'completed') stats.completed += 1;
      else if (health === 'inProgress') stats.inProgress += 1;
      else if (health === 'overdue') stats.overdue += 1;
      byDate.set(task.dueDate, stats);
    }
    return byDate;
  }, [tasks, selectedMonth]);

  const todayTasks = selectedDayTasks
    .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  const upcomingTasks = tasks.filter((t) => t.dueDate === tomorrow && !t.completed).slice(0, 2);

  // The list shows the selected day; the category chips filter it. Search is on the Tasks page.
  const categoryLabel = useCategoryName();
  const chips = useMemo(() => categoryCounts(tasks), [tasks]);
  const activeFilter = filter && chips.some((chip) => chip.id === filter) ? filter : null;
  const listed = filterByCategory(todayTasks, activeFilter);
  const groups = groupByCategory(listed);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: compact ? 16 : 20 }]}>
        <View style={styles.header}>
          <ThemedText
            style={[styles.greeting, compact && styles.greetingCompact]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}>
            {formatGreeting(t)}, {firstName(user?.name, t('home.there'))}
          </ThemedText>
          <ThemeToggle />
        </View>

        <Pressable
          onPress={() => router.push('/ai')}
          style={[styles.aiBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <OrdinaMark size={28} />
          <ThemedText themeColor="textSecondary" style={styles.aiBarText}>
            {t('home.tellOrdina')}
          </ThemedText>
          <Ionicons name="mic-outline" size={20} color={theme.textSecondary} />
        </Pressable>

        {loadError ? (
          <View accessibilityRole="alert" style={[styles.loadNotice, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            <Ionicons name="folder-open-outline" size={20} color={theme.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={styles.loadNoticeTitle}>{t('home.loadFailed')}</ThemedText>
              {loadErrorDetail ? (
                <ThemedText themeColor="textSecondary" style={styles.loadNoticeDetail} numberOfLines={2}>{loadErrorDetail}</ThemedText>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void loadTasks()}>
              <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('common.tryAgain')}</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {chips.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {[{ id: null as string | null, count: tasks.length }, ...chips].map((chip) => {
              const active = activeFilter === chip.id;
              const info = chip.id ? categoryInfo(chip.id) : null;
              const tint = info?.color ?? theme.primary;
              return (
                <Pressable
                  key={chip.id ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(chip.id)}
                  style={[styles.filterChip, { borderColor: active ? tint : theme.border, backgroundColor: active ? `${tint}1F` : theme.card }]}>
                  {info ? <Ionicons name={asIcon(info.icon)} size={13} color={tint} /> : null}
                  <ThemedText style={[styles.filterText, { color: active ? tint : theme.text }]}>
                    {chip.id ? categoryLabel(chip.id) : t('home.all')}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.filterCount}>{chip.count}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={[styles.overview, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.overviewHeader}>
            <ThemedText style={[styles.sectionTitle, styles.overviewTitle]}>{t('home.dashboard')}</ThemedText>
            {FEATURES.integrations ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/integrations')}
                style={styles.integrationsLink}>
                <Ionicons name="git-network-outline" size={16} color={theme.primary} />
                <ThemedText style={{ color: theme.primary }}>Integrations</ThemedText>
              </Pressable>
            ) : null}
          </View>
          <ThemedText themeColor="textSecondary" style={styles.dateText}>
            {todaysTasks.length === 1 ? t('home.todayCountOne') : t('home.todayCount', { n: todaysTasks.length })}
            {upcomingCount ? ` · ${t('home.upcoming', { n: upcomingCount })}` : ''}
          </ThemedText>
          <StatusBar counts={dash} colors={theme} />
          <View style={styles.overviewMetrics}>
            {([
              { key: 'completed', value: dash.completed, color: theme.success },
              { key: 'inProgress', value: dash.inProgress, color: theme.warning },
              { key: 'overdue', value: dash.overdue, color: theme.danger },
            ] as const).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={t(CARD_LABEL[item.key], { n: item.value })}
                accessibilityHint={t('home.cardHint')}
                // A new "at" each time, so tapping the same card again re-applies the filter.
                onPress={() => router.push({ pathname: '/tasks', params: { status: item.key, at: String(Date.now()) } })}
                style={({ pressed }) => [
                  styles.metric,
                  { borderColor: pressed ? item.color : theme.border, backgroundColor: pressed ? `${item.color}1F` : `${item.color}0D`, opacity: pressed ? 0.85 : 1 },
                ]}>
                <View style={styles.metricHead}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <ThemedText style={[styles.metricValue, { color: item.color }]}>{item.value}</ThemedText>
                  <Ionicons name="chevron-forward" size={14} color={item.color} style={styles.metricArrow} />
                </View>
                <ThemedText themeColor="textSecondary" style={styles.metricLabel}>
                  {t(STATUS_KEY[item.key])}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {nextUp ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
            <ThemedText themeColor="textSecondary">Do this now</ThemedText>
            <ThemedText style={styles.sectionTitle}>{nextUp}</ThemedText>
          </View>
        ) : null}

        {FEATURES.serverWorkspace ? (
          <View style={[styles.workspace, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText style={[styles.sectionTitle, styles.workspaceTitle]}>Your workspace</ThemedText>
            {workspaceError ? (
              <ThemedText themeColor="textSecondary" style={styles.workspaceError}>
                Some dashboard details could not be loaded. Check your connection and reopen this screen to retry.
              </ThemedText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/goals')}
              style={[styles.workspaceRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.workspaceIcon, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="flag-outline" size={18} color={theme.primary} />
              </View>
              <ThemedText style={styles.workspaceLabel}>Active goals</ThemedText>
              <ThemedText style={styles.workspaceCount}>{activeGoals.length}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
            {FEATURES.reminders ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/reminders')}
                style={[styles.workspaceRow, { borderBottomColor: theme.border }]}>
                <View style={[styles.workspaceIcon, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="alarm-outline" size={18} color={theme.primary} />
                </View>
                <ThemedText style={styles.workspaceLabel}>Active reminders</ThemedText>
                <ThemedText style={styles.workspaceCount}>{activeReminders.length}</ThemedText>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/notifications')}
              style={styles.workspaceRow}>
              <View style={[styles.workspaceIcon, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="notifications-outline" size={18} color={theme.primary} />
              </View>
              <ThemedText style={styles.workspaceLabel}>Unread notifications</ThemedText>
              <ThemedText style={styles.workspaceCount}>{unreadNotifications}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.dashboard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.dashboardHeader}>
            <View>
              <ThemedText style={styles.sectionTitle}>{t('home.productivity')}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.dateText}>
                {selectedMonth === today.slice(0, 7) ? t('home.monthToDate') : t('home.monthly')}
              </ThemedText>
            </View>
            <ThemedText style={[styles.monthScore, { color: monthPercent === null
              ? theme.textSecondary
              : monthPercent >= 75
                ? theme.success
                : monthPercent > 25
                  ? theme.warning
                  : theme.danger }]}>
              {monthPercent === null ? '—' : `${monthPercent}%`}
            </ThemedText>
          </View>
          <StatusBar counts={monthCounts} colors={theme} />
          <ThemedText themeColor="textSecondary" style={styles.monthSummary}>
            {monthTasksUntil.length
              ? t('home.monthSummary', { done: monthCounts.completed, progress: monthCounts.inProgress, late: monthCounts.overdue })
              : selectedMonth > today.slice(0, 7)
                ? t('home.notStarted')
                : t('home.noneThisMonth')}
          </ThemedText>
          <View style={styles.monthNavigation}>
            <Pressable
              accessibilityLabel={t('home.previousMonth')}
              onPress={() => {
                const previous = new Date(month.getFullYear(), month.getMonth() - 1, 1);
                setMonth(previous);
                setSelectedDate(localDateKey(previous));
              }}>
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </Pressable>
            <ThemedText style={styles.monthLabel}>{monthTitle(month, locale)}</ThemedText>
            <Pressable
              accessibilityLabel={t('home.nextMonth')}
              onPress={() => {
                const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
                setMonth(next);
                setSelectedDate(localDateKey(next));
              }}>
              <Ionicons name="chevron-forward" size={18} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {weekdayLetters(locale).map((label, index) => (
              <ThemedText key={`${label}-${index}`} themeColor="textSecondary" style={styles.weekday}>
                {label}
              </ThemedText>
            ))}
            {monthDays.map((day, index) => {
              if (day === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const dateKey = localDateKey(date);
              const stats = dayPerformance.get(dateKey);
              const isEvaluated = dateKey <= today;
              const evaluated = Boolean(stats?.total && isEvaluated);
              const statusColor = !stats?.total || !evaluated
                ? theme.backgroundElement
                : stats.overdue
                  ? theme.danger
                  : stats.completed === stats.total
                    ? theme.success
                    : theme.warning;
              const isSelected = dateKey === selectedDate;
              return (
                <Pressable
                  key={dateKey}
                  accessibilityLabel={`${dateKey}${stats && isEvaluated
                    ? `, ${stats.completed} of ${stats.total} tasks completed`
                    : stats
                      ? ', performance not measured yet'
                      : ', no tasks planned'}`}
                  onPress={() => setSelectedDate(dateKey)}
                  style={[
                    styles.dayCell,
                    styles.dayButton,
                    {
                      backgroundColor: statusColor,
                      borderColor: isSelected ? theme.primary : 'transparent',
                      borderWidth: isSelected ? 2 : 0,
                    },
                  ]}>
                  <ThemedText style={[styles.dayNumber, { color: evaluated ? '#0F172A' : theme.text }]}>
                    {day}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            {[
              { label: t('home.completed'), color: theme.success },
              { label: t('home.inProgress'), color: theme.warning },
              { label: t('home.incomplete'), color: theme.danger },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <ThemedText themeColor="textSecondary" style={styles.legendText}>{item.label}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <ThemedText style={styles.sectionTitle}>
          {selectedDate === today
            ? t('home.todaySchedule')
            : t('home.scheduleOn', { date: new Date(`${selectedDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) })}
        </ThemedText>
        {selectedDayTasks.length > 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.daySummary}>
            {t('home.nOfComplete', { done: selectedDayCompleted, total: selectedDayTasks.length })}
          </ThemedText>
        ) : null}
        {listed.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
            <ThemedText themeColor="textSecondary">
              {activeFilter
                ? t('home.noTasksInCategory', { category: categoryLabel(activeFilter) })
                : t('home.noTasksToday')}
            </ThemedText>
          </View>
        ) : (
          groups.map((group) => {
            const info = categoryInfo(group.category);
            const isCollapsed = collapsedGroups.has(group.category);
            return (
              <View key={group.category} style={styles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !isCollapsed }}
                  onPress={() => setCollapsedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.category)) next.delete(group.category);
                    else next.add(group.category);
                    return next;
                  })}
                  style={styles.groupHead}>
                  <View style={[styles.groupIcon, { backgroundColor: `${info.color}1F` }]}>
                    <Ionicons name={asIcon(info.icon)} size={14} color={info.color} />
                  </View>
                  <ThemedText style={styles.groupTitle}>{categoryLabel(group.category)}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.groupCount}>
                    {t('tasksTab.pendingDone', { pending: group.pending, done: group.done })}
                  </ThemedText>
                  <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
                </Pressable>
                {isCollapsed ? null : group.tasks.map((task) => {
                  const status = dashboardStatus(task);
                  return (
                  <View key={task.id} style={[styles.row, { backgroundColor: theme.card }]}>
                    <View style={[styles.statusStripe, { backgroundColor: statusTint(status, theme) }]} />
                    <ThemedText themeColor="textSecondary" style={styles.time}>
                      {task.startTime ?? t('home.anytime')}
                    </ThemedText>
                    <Pressable
                      style={styles.rowBody}
                      onPress={() => router.push({ pathname: '/new-task', params: { id: task.id } })}>
                      <ThemedText style={[styles.rowTitle, task.completed && styles.strike]} numberOfLines={1}>
                        {task.title}
                      </ThemedText>
                      <View style={styles.rowMeta}>
                        <ThemedText style={[styles.rowStatus, { color: statusTint(status, theme) }]}>
                          {t(STATUS_KEY[status])}
                        </ThemedText>
                        {task.contactPhone && !task.completed ? (
                          <ContactActions name={task.contactName} phone={task.contactPhone} compact />
                        ) : null}
                      </View>
                    </Pressable>
                    {!task.completed ? (
                      <TouchableOpacity
                        accessibilityLabel={task.status === 'in_progress' ? t('home.pauseTask') : t('home.startTask')}
                        hitSlop={6}
                        onPress={() => void toggleInProgress(task.id)}
                        style={styles.startButton}>
                        <Ionicons
                          name={task.status === 'in_progress' ? 'pause-circle' : 'play-circle-outline'}
                          size={24}
                          color={task.status === 'in_progress' ? theme.warning : theme.textSecondary}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => void toggleComplete(task.id).catch((error) => toast.error(friendlyError(error, t('home.updateFailed'))))}
                      style={[
                        styles.checkbox,
                        {
                          borderColor: task.completed ? theme.success : theme.border,
                          backgroundColor: task.completed ? theme.success : 'transparent',
                        },
                      ]}>
                      {task.completed ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </TouchableOpacity>
                  </View>
                  );
                })}
              </View>
            );
          })
        )}

        {upcomingTasks.length > 0 ? (
          <>
            <ThemedText style={styles.sectionTitle}>{t('home.upcomingTomorrow')}</ThemedText>
            {upcomingTasks.map((task) => (
              <View key={task.id} style={[styles.upcoming, { backgroundColor: theme.card }]}>
                <View style={[styles.dot, { backgroundColor: categoryInfo(task.category).color }]} />
                <ThemedText numberOfLines={1}>
                  {task.startTime ? `${task.startTime} — ` : ''}
                  {task.title}
                </ThemedText>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  greeting: { flex: 1, fontSize: 24, fontFamily: 'Poppins_700Bold', lineHeight: 30 },
  greetingCompact: { fontSize: 20, lineHeight: 26 },
  dateText: { fontSize: 14, marginTop: 2 },
  aiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  aiBarText: { flex: 1, fontSize: 15 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 12,
    marginTop: 8,
  },
  daySummary: { marginTop: -8, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 10,
  },
  time: { width: 52, fontSize: 11, lineHeight: 15 },
  loadNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  loadNoticeTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  loadNoticeDetail: { fontSize: 11 },
  chipScroll: { marginBottom: 16, flexGrow: 0 },
  chipRow: { gap: 8, paddingRight: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  filterText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  filterCount: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  group: { marginBottom: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  groupCount: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  statusStripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  rowBody: { flex: 1, gap: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowStatus: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  startButton: { padding: 2 },
  statusBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, marginBottom: 12 },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricArrow: { marginLeft: -2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  strike: { textDecorationLine: 'line-through', opacity: 0.55 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: { borderRadius: 14, padding: 20, marginBottom: 12 },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  dashboard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 },
  overview: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 },
  overviewTitle: { marginTop: 0, marginBottom: 0 },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  integrationsLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overviewMetrics: { flexDirection: 'row', marginTop: 2 },
  metric: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 8, marginHorizontal: 3, minHeight: 56, justifyContent: 'center' },
  clearFilter: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: -4 },
  hidden: { display: 'none' },
  metricValue: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  workspace: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 8, marginBottom: 16 },
  workspaceTitle: { marginBottom: 4 },
  workspaceError: { fontSize: 12, marginBottom: 8 },
  workspaceRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  workspaceIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  workspaceLabel: { flex: 1, fontFamily: 'Poppins_500Medium' },
  workspaceCount: { fontFamily: 'Poppins_600SemiBold' },
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthScore: { fontSize: 26, fontFamily: 'Poppins_700Bold' },
  monthSummary: { marginTop: -4, marginBottom: 12, fontSize: 12 },
  monthNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, paddingVertical: 6 },
  dayCell: { width: '14.2857%', height: 34, alignItems: 'center', justifyContent: 'center' },
  dayButton: { borderRadius: 17 },
  dayNumber: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Poppins_500Medium' },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10 },
});
