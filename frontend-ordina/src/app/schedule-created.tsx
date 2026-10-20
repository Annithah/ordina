import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatDuration, formatTime } from '@/i18n/format';
import { durationMinutes } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import { useTasksStore } from '@/store/tasks-store';
import { href } from '@/utils/href';

export default function ScheduleCreatedScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ taskIds?: string | string[] }>();
  const allTasks = useTasksStore((state) => state.tasks);
  const { nameOf } = useCategories();
  const { t, locale } = useI18n();
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
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.check, { backgroundColor: theme.success }]}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.title} accessibilityRole="header">{t('schedule.created')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('schedule.createdSub', { count: tasks.length })}</ThemedText>
        </View>
        {tasks.map((task) => (
          <View key={task.id} style={styles.row}>
            <View style={styles.when}>
              <ThemedText style={styles.time}>{task.startTime ? formatTime(locale, task.startTime) : t('dates.anytime')}</ThemedText>
              <ThemedText themeColor="textSecondary">{task.dueDate ? formatDay(locale, task.dueDate) : ''}</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.card, borderLeftColor: theme.primary }]}>
              <ThemedText style={styles.cardTitle}>{task.title}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {nameOf(task.categoryId)}
                {task.duration ? ` · ${formatDuration(locale, durationMinutes(task.duration))}` : ''}
              </ThemedText>
            </View>
          </View>
        ))}
        {tasks.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            {t('schedule.empty')}
          </ThemedText>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={t('schedule.viewTasks')} onPress={() => router.replace(href('/(tabs)'))} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  content: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 24, gap: 8, marginBottom: 24 },
  check: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  group: { fontSize: 11, letterSpacing: 1.4, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  when: { width: 88 },
  time: { fontFamily: 'Poppins_600SemiBold' },
  card: { flex: 1, borderLeftWidth: 4, borderRadius: 12, padding: 12 },
  cardTitle: { fontFamily: 'Poppins_500Medium' },
  empty: { textAlign: 'center', marginTop: 24 },
  footer: { marginTop: 'auto', paddingBottom: 24, gap: 12 },
  changes: { alignItems: 'center', paddingVertical: 8 },
});
