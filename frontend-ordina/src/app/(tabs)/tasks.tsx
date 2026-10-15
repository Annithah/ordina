/**
 * ORDINA Tasks List Screen
 * Matches the dark-mode mockup design – implemented in light mode by default.
 * Shows: Search bar, filter chips, IN PROGRESS / UPCOMING task groups, FAB (+).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContactActions } from '@/components/contact-actions';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { href } from '@/utils/href';
import { addLocalDays, localDateKey } from '@/utils/dates';
import { HEALTH_LABEL, healthColor, taskHealth } from '@/utils/task-health';

type FilterKey = 'all' | 'today' | 'this_week' | 'overdue' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

function getPriorityColor(priority: Task['priority']): string {
  switch (priority) {
    case 'high': return '#EF4444';
    case 'medium': return '#F59E0B';
    default: return '#64748B';
  }
}

function getCategoryLabel(category: Task['category']): string {
  const map: Record<string, string> = {
    work: 'Work',
    personal: 'Personal',
    health: 'Health',
    learning: 'Learning',
    design: 'Design',
    database: 'Database',
  };
  return map[category] ?? category;
}

function formatDueLabel(dueDate?: string): string {
  if (!dueDate) return '';
  const today = localDateKey();
  const tomorrow = addLocalDays(today, 1);
  if (dueDate === today) return 'Today';
  if (dueDate === tomorrow) return 'Tomorrow';
  const d = new Date(`${dueDate}T12:00:00`);
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
}

interface TaskRowProps {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
}

function TaskRow({ task, onPress, onToggle }: TaskRowProps) {
  const theme = useTheme();
  const health = taskHealth(task);
  const statusColor = healthColor(health, theme);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.taskRow, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: statusColor, borderLeftWidth: 4 }]}
    >
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: task.completed ? theme.success : theme.border,
            backgroundColor: task.completed ? theme.success : 'transparent',
          },
        ]}
      >
        {task.completed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
      </TouchableOpacity>
      <View style={styles.taskInfo}>
        <ThemedText
          style={[styles.taskTitle, task.completed && styles.strikethrough]}
          numberOfLines={1}
        >
          {task.title}
        </ThemedText>
        <View style={styles.taskMeta}>
          <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
          <ThemedText themeColor="textSecondary" style={styles.metaText}>
            {getCategoryLabel(task.category)}
          </ThemedText>
          {task.dueDate && (
            <ThemedText themeColor="textSecondary" style={styles.metaText}>
              • {formatDueLabel(task.dueDate)}{task.startTime ? ` ${task.startTime}` : ''}
            </ThemedText>
          )}
          <ThemedText style={[styles.metaText, { color: statusColor }]}>• {HEALTH_LABEL[health]}</ThemedText>
        </View>
        {task.contactPhone && !task.completed ? (
          <View style={{ marginTop: 6 }}>
            <ContactActions name={task.contactName} phone={task.contactPhone} />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <ThemedText
      style={[styles.sectionHeader, { color: theme.textSecondary }]}
      themeColor="textSecondary"
    >
      {title}
    </ThemedText>
  );
}

export default function TasksScreen() {
  const theme = useTheme();
  const { tasks, toggleComplete, loadTasks } = useTasksStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const today = localDateKey();
  const weekEnd = addLocalDays(today, 7);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q)
      );
    }
    switch (filter) {
      case 'today':
        return list.filter((t) => t.dueDate === today);
      case 'this_week':
        return list.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
      case 'overdue':
        return list.filter((t) => t.dueDate && t.dueDate < today && !t.completed);
      case 'completed':
        return list.filter((t) => t.completed);
      default:
        return list;
    }
  }, [tasks, filter, search, today, weekEnd]);

  const overdue = filteredTasks.filter((t) => taskHealth(t) === 'overdue');
  const inProgress = filteredTasks.filter((t) => taskHealth(t) === 'inProgress');
  const upcoming = filteredTasks.filter((t) => taskHealth(t) === 'planned');
  const completed = filteredTasks.filter((t) => t.completed);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Pressable
          onPress={() => router.push(href('/search'))}
          style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text, fontFamily: 'Poppins_400Regular' }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </Pressable>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.primary : theme.card,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                style={[styles.chipText, { color: active ? '#FFFFFF' : theme.textSecondary }]}
              >
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Task List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
      >
        {overdue.length > 0 && (
          <>
            <SectionHeader title="OVERDUE" />
            {overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onPress={() => router.push({ pathname: '/new-task', params: { id: t.id } })}
                onToggle={() => toggleComplete(t.id)}
              />
            ))}
          </>
        )}

        {inProgress.length > 0 && (
          <>
            <SectionHeader title="IN PROGRESS" />
            {inProgress.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onPress={() => router.push({ pathname: '/new-task', params: { id: t.id } })}
                onToggle={() => toggleComplete(t.id)}
              />
            ))}
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <SectionHeader title="UPCOMING" />
            {upcoming.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onPress={() => router.push({ pathname: '/new-task', params: { id: t.id } })}
                onToggle={() => toggleComplete(t.id)}
              />
            ))}
          </>
        )}

        {completed.length > 0 && (
          <>
            <SectionHeader title="COMPLETED" />
            {completed.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onPress={() => router.push({ pathname: '/new-task', params: { id: t.id } })}
                onToggle={() => toggleComplete(t.id)}
              />
            ))}
          </>
        )}

        {filteredTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkbox-outline" size={48} color={theme.textSecondary} />
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {search ? 'No tasks match your search.' : 'No tasks here. Create one!'}
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => router.push(href('/new-task'))}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  filtersRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  list: { paddingHorizontal: 16 },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskInfo: { flex: 1, gap: 3 },
  taskTitle: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  strikethrough: { textDecorationLine: 'line-through', opacity: 0.5 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { fontSize: 12 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#5C4DF2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
});
