/**
 * One category: its tasks (overdue, pending, completed, including subcategories), progress
 * this week, its subcategories, and quick-add with the category already chosen.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFormSheet, asIcon } from '@/components/category-ui';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { withChildren } from '@/features/category-tree';
import { useTheme } from '@/hooks/use-theme';
import { href } from '@/utils/href';
import { useI18n } from '@/providers/i18n-provider';
import { nameOf, useCategoriesStore } from '@/store/categories-store';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { taskStatus } from '@/utils/task-health';
import { formatTime12, friendlyDay } from '@/utils/task-planning';
import { friendlyError } from '@/utils/task-validation';

function weekRange(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const offset = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const start = addLocalDays(today, -offset);
  return { start, end: addLocalDays(start, 6) };
}

export default function CategoryDetailScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategoriesStore((s) => s.categories);
  const tasks = useTasksStore((s) => s.tasks);
  const toggleComplete = useTasksStore((s) => s.toggleComplete);
  const [editing, setEditing] = useState(false);
  const record = categories.find((item) => item.id === id && !item.deletedAt);
  const parent = record?.parentId ? categories.find((item) => item.id === record.parentId) : undefined;
  const children = categories.filter((item) => item.parentId === id && !item.deletedAt && !item.isArchived);
  const today = localDateKey();

  const mine = useMemo(() => {
    const ids = new Set(record ? withChildren(record.id, categories) : []);
    return tasks.filter((task) => ids.has(task.category));
  }, [tasks, categories, record]);

  const overdue = mine.filter((task) => taskStatus(task) === 'overdue');
  const pending = mine.filter((task) => !task.completed && taskStatus(task) !== 'overdue')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  const completed = mine.filter((task) => task.completed).sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
  const { start, end } = weekRange(today);
  const thisWeek = mine.filter((task) => task.dueDate && task.dueDate >= start && task.dueDate <= end);
  const weekDone = thisWeek.filter((task) => task.completed).length;
  const progress = thisWeek.length ? weekDone / thisWeek.length : 0;

  if (!record) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.title, { marginTop: 24 }]}>{t('categories.notFound')}</ThemedText>
      </SafeAreaView>
    );
  }

  const renderSection = (title: string, items: Task[], tint?: string) => (items.length ? (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, tint ? { color: tint } : null]}>{title} · {items.length}</ThemedText>
      {items.map((task) => (
        <Pressable
          key={task.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/new-task', params: { id: task.id } })}
          style={[styles.task, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: record.color }]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: task.completed }}
            hitSlop={8}
            onPress={() => void toggleComplete(task.id).catch((error) => toast.error(friendlyError(error, t('home.updateFailed'))))}
            style={[styles.check, { borderColor: task.completed ? theme.success : theme.border, backgroundColor: task.completed ? theme.success : 'transparent' }]}>
            {task.completed ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.taskTitle, task.completed && styles.strike]} numberOfLines={2}>{task.title}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.taskMeta}>
              {task.dueDate ? friendlyDay(task.dueDate) : t('tasksTab.noDate')}
              {task.startTime ? ` · ${formatTime12(task.startTime)}` : ''}
              {task.category !== record.id ? ` · ${nameOf(categories.find((item) => item.id === task.category) ?? { id: task.category, name: '' })}` : ''}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </View>
  ) : null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('categories.edit')} onPress={() => setEditing(true)} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="create-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: `${record.color}14`, borderColor: `${record.color}55` }]}>
          <View style={[styles.heroIcon, { backgroundColor: record.color }]}>
            <Ionicons name={asIcon(record.icon)} size={26} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            {parent ? <ThemedText themeColor="textSecondary" style={styles.parentName}>{nameOf(parent)} ›</ThemedText> : null}
            <ThemedText style={styles.title}>{nameOf(record)}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.counts}>
              {t('tasksTab.pendingDone', { pending: pending.length + overdue.length, done: completed.length })}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressHead}>
            <ThemedText style={styles.progressTitle}>{t('categories.weekProgress')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.progressValue}>
              {thisWeek.length ? t('categories.weekDone', { done: weekDone, total: thisWeek.length }) : t('categories.weekEmpty')}
            </ThemedText>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: Math.max(1, thisWeek.length), now: weekDone }}
            style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: record.color }]} />
          </View>
        </View>

        {children.length ? (
          <View style={styles.chips}>
            {children.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                onPress={() => router.push(href(`/category/${child.id}`))}
                style={[styles.chip, { backgroundColor: `${child.color}1A` }]}>
                <Ionicons name={asIcon(child.icon)} size={14} color={child.color} />
                <ThemedText style={[styles.chipText, { color: child.color }]}>{nameOf(child)}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/new-task', params: { category: record.id, date: today } })}
          style={[styles.quickAdd, { backgroundColor: record.color }]}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <ThemedText style={styles.quickAddText}>{t('categories.quickAdd', { name: nameOf(record) })}</ThemedText>
        </Pressable>

        {renderSection(t('tasksTab.overdue'), overdue, theme.danger)}
        {renderSection(t('categories.pending'), pending)}
        {renderSection(t('tasksTab.completed'), completed)}
        {mine.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name={asIcon(record.icon)} size={32} color={record.color} />
            <ThemedText style={styles.emptyTitle}>{t('categories.emptyTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('categories.emptyBody')}</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <CategoryFormSheet visible={editing} editId={record.id} onDone={() => setEditing(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 14, paddingVertical: 14, paddingBottom: 40 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 20, padding: 16 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  parentName: { fontSize: 12 },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  counts: { fontSize: 13 },
  progressCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  progressTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  progressValue: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  quickAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, minHeight: 50 },
  quickAddText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 12, minHeight: 56 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  taskMeta: { fontSize: 12 },
  strike: { textDecorationLine: 'line-through', opacity: 0.55 },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, padding: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
});
