import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useTasksStore } from '@/store/tasks-store';
import { href } from '@/utils/href';

export default function ScheduleCreatedScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{ taskIds?: string | string[] }>();
  const allTasks = useTasksStore((state) => state.tasks);
  const taskIds = Array.isArray(params.taskIds) ? params.taskIds : (params.taskIds || '').split(',');
  const tasks = useMemo(
    () => allTasks
      .filter((task) => taskIds.includes(task.id))
      .sort((left, right) =>
        (left.dueDate || '').localeCompare(right.dueDate || '')
        || (left.startTime || '').localeCompare(right.startTime || ''),
      ),
    [allTasks, params.taskIds],
  );
  const scheduleDate = tasks[0]?.dueDate
    ? new Date(`${tasks[0].dueDate}T12:00:00`).toLocaleDateString(locale, {
      month: 'long',
      day: 'numeric',
    })
    : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.check, { backgroundColor: theme.success }]}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.title}>{t('tasksTab.scheduleCreated')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {tasks.length
              ? `${tasks.length === 1 ? t('tasksTab.savedCountOne') : t('tasksTab.savedCount', { n: tasks.length })}${scheduleDate ? t('tasksTab.savedFor', { date: scheduleDate }) : ''}`
              : t('tasksTab.changesConfirmed')}
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary" style={styles.group}>{t('tasksTab.yourPlan')}</ThemedText>
        {tasks.map((task) => (
          <View key={task.id} style={styles.row}>
            <View style={styles.when}>
              <ThemedText style={styles.time}>{task.startTime || t('task.anytime')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {task.dueDate
                  ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                  : ''}
              </ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.card, borderLeftColor: theme.primary }]}>
              <ThemedText style={styles.cardTitle}>{task.title}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {t(`categories.items.${task.category}`)}
                {task.duration ? ` · ${task.duration}` : ''}
              </ThemedText>
            </View>
          </View>
        ))}
        {tasks.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            View your current tasks from the calendar or task list.
          </ThemedText>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={t('tasksTab.viewCalendar')} onPress={() => router.replace(href('/calendar'))} />
        <Pressable onPress={() => router.replace('/ai')} style={styles.changes}>
          <ThemedText>{t('tasksTab.makeChanges')}</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  content: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 24, gap: 8, marginBottom: 24 },
  check: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
  group: { fontSize: 11, letterSpacing: 1.4, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  when: { width: 76 },
  time: { fontFamily: 'Poppins_600SemiBold' },
  card: { flex: 1, borderLeftWidth: 4, borderRadius: 12, padding: 12 },
  cardTitle: { fontFamily: 'Poppins_500Medium' },
  empty: { textAlign: 'center', marginTop: 24 },
  footer: { marginTop: 'auto', paddingBottom: 24, gap: 12 },
  changes: { alignItems: 'center', paddingVertical: 8 },
});
