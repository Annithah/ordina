import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatDuration, formatTime } from '@/i18n/format';
import { durationMinutes, isOverdue } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import type { Task } from '@/store/tasks-store';

const PRIORITY_COLOR: Record<Task['priority'], string> = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' };

type Props = {
  task: Task;
  onToggle: (task: Task) => void;
  /** Show the day too (lists that mix days, e.g. "By category"). */
  showDay?: boolean;
  /** Hide the category (already shown by the group header). */
  hideCategory?: boolean;
};

function TaskRowBase({ task, onToggle, showDay, hideCategory }: Props) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { find, nameOf } = useCategories();
  const overdue = isOverdue(task);
  const status = task.completed ? 'completed' : overdue ? 'overdue' : task.status === 'in_progress' ? 'inProgress' : 'pending';
  const color = status === 'completed' ? theme.success : status === 'overdue' ? theme.danger : status === 'inProgress' ? theme.warning : theme.primary;
  const category = find(task.categoryId);
  const minutes = durationMinutes(task.duration);
  const when = [
    showDay && task.dueDate ? formatDay(locale, task.dueDate) : null,
    task.startTime ? formatTime(locale, task.startTime) : t('dates.anytime'),
    minutes ? formatDuration(locale, minutes) : null,
  ].filter(Boolean).join(' · ');
  const statusLabel = t(`status.${status}`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${when}, ${nameOf(task.categoryId)}, ${statusLabel}`}
      onPress={() => router.push({ pathname: '/new-task', params: { id: task.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: color, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed }}
        accessibilityLabel={task.completed ? t('task.markNotDone', { title: task.title }) : t('task.markDone', { title: task.title })}
        onPress={() => onToggle(task)}
        hitSlop={8}
        style={styles.checkTarget}>
        <View style={[styles.checkbox, { borderColor: task.completed ? theme.success : theme.border, backgroundColor: task.completed ? theme.success : 'transparent' }]}>
          {task.completed ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
      </Pressable>
      <View style={styles.body}>
        <ThemedText style={[styles.title, task.completed && styles.done]} numberOfLines={2}>{task.title}</ThemedText>
        <View style={styles.meta}>
          <Ionicons name={task.startTime ? 'time-outline' : 'sunny-outline'} size={13} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.metaText} numberOfLines={1}>{when}</ThemedText>
          {task.reminder !== 'none' && !task.completed ? <Ionicons name="notifications-outline" size={12} color={theme.textSecondary} /> : null}
        </View>
        <View style={styles.meta}>
          {hideCategory ? null : (
            <>
              <Ionicons name={category.icon} size={12} color={category.color} />
              <ThemedText style={[styles.metaText, { color: category.color }]} numberOfLines={1}>{nameOf(task.categoryId)}</ThemedText>
            </>
          )}
          <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[task.priority] }]} />
          <ThemedText themeColor="textSecondary" style={styles.metaText}>{t(`priority.${task.priority}`)}</ThemedText>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
        <ThemedText style={[styles.badgeText, { color }]} numberOfLines={1}>{statusLabel}</ThemedText>
      </View>
    </Pressable>
  );
}

export const TaskRow = memo(TaskRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, paddingVertical: 10, paddingRight: 10, marginBottom: 8 },
  checkTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  done: { textDecorationLine: 'line-through', opacity: 0.55 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 12, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 96 },
  badgeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
});
