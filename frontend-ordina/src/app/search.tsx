import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useProjectsStore } from '@/store/projects-store';
import { useTasksStore } from '@/store/tasks-store';
import { friendlyError } from '@/utils/task-validation';

export default function SearchScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { tasks, toggleComplete, loadTasks } = useTasksStore();
  const optionLabel: Record<string, string> = {
    All: t('home.all'),
    'In Progress': t('home.inProgress'),
    Completed: t('home.completed'),
    High: t('task.high'),
    Medium: t('task.medium'),
    Low: t('task.low'),
  };
  const { projects, loadProjects } = useProjectsStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const [projectId, setProjectId] = useState('All');

  useEffect(() => {
    void loadTasks();
    void loadProjects();
  }, [loadTasks, loadProjects]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const text = `${task.title} ${task.description || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (status === 'Completed' && !task.completed) return false;
      if (status === 'In Progress' && task.completed) return false;
      if (priority !== 'All' && task.priority !== priority.toLowerCase()) return false;
      if (projectId !== 'All' && task.projectId !== projectId) return false;
      return true;
    });
  }, [tasks, query, status, priority, projectId]);

  function cycle<T>(current: T, options: T[]) {
    return options[(options.indexOf(current) + 1) % options.length];
  }

  const projectOptions = ['All', ...projects.map((project) => project.id)];
  const projectLabel = projectId === 'All' ? t('home.all') : projects.find((project) => project.id === projectId)?.name || t('home.all');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.search, { borderColor: theme.primary, backgroundColor: theme.card }]}>
        <Ionicons name="search" size={18} color={theme.primary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={t('tasksTab.searchTasks')}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />
      </View>

      <View style={styles.filters}>
        <ThemedText style={styles.filterTitle}>{t('tasksTab.filters')}</ThemedText>
        {[
          { label: t('tasksTab.byStatus'), value: optionLabel[status], set: () => setStatus(cycle(status, ['All', 'In Progress', 'Completed'])) },
          { label: t('tasksTab.byPriority'), value: optionLabel[priority], set: () => setPriority(cycle(priority, ['All', 'High', 'Medium', 'Low'])) },
          {
            label: t('tasksTab.byProject'),
            value: projectLabel,
            set: () => setProjectId(cycle(projectId, projectOptions)),
          },
        ].map((row) => (
          <Pressable key={row.label} onPress={row.set} style={styles.filterRow}>
            <ThemedText>{row.label}</ThemedText>
            <View style={styles.filterValue}>
              <ThemedText style={{ color: theme.primary }}>{row.value}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={theme.primary} />
            </View>
          </Pressable>
        ))}
      </View>

      <ThemedText themeColor="textSecondary" style={styles.group}>
        {t('tasksTab.matching', { n: matches.length })}
      </ThemedText>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {matches.map((task) => (
          <View key={task.id} style={[styles.task, { backgroundColor: theme.card }]}>
            <Pressable
              onPress={() => void toggleComplete(task.id).catch((error) => toast.error(friendlyError(error, t('home.updateFailed'))))}
              style={[
                styles.box,
                {
                  borderColor: task.completed ? theme.primary : theme.border,
                  backgroundColor: task.completed ? theme.primary : 'transparent',
                },
              ]}>
              {task.completed ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <ThemedText style={task.completed ? styles.strike : undefined}>{task.title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.meta}>
                {t(`task.${task.priority}`)} • {task.dueDate || t('tasksTab.noDate')}
              </ThemedText>
            </View>
          </View>
        ))}
        {matches.length === 0 ? (
          <ThemedText themeColor="textSecondary">{t('tasksTab.noMatch')}</ThemedText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', paddingVertical: 12 },
  group: { fontSize: 11, letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 8 },
  filters: { paddingHorizontal: 16, marginBottom: 12 },
  filterTitle: { fontSize: 11, letterSpacing: 1.2, marginBottom: 8, opacity: 0.7 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  filterValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  strike: { textDecorationLine: 'line-through', opacity: 0.55 },
  meta: { fontSize: 12, textTransform: 'capitalize' },
});
