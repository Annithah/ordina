/**
 * Notification centre: what ORDINA showed in the last 30 days, with the same actions as the
 * phone notification. Mark all as read; swipe left to delete.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { setLocalTaskCompleted, updateLocalTask } from '@/services/local-tasks';
import { deleteLogEntry, markAllRead, markRead, requestReschedule, useInbox, type LogEntry } from '@/services/notifications';
import { useTasksStore } from '@/store/tasks-store';
import { addDays, dateKey } from '@/features/notification-plan';

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_ICON: Record<string, { icon: IconName; tint: 'primary' | 'success' | 'warning' | 'danger' }> = {
  reminder: { icon: 'alarm-outline', tint: 'primary' },
  reminderGroup: { icon: 'alarm-outline', tint: 'primary' },
  snooze: { icon: 'alarm-outline', tint: 'primary' },
  morning: { icon: 'sunny-outline', tint: 'warning' },
  planPrompt: { icon: 'sunny-outline', tint: 'warning' },
  evening: { icon: 'moon-outline', tint: 'primary' },
  overdue: { icon: 'time-outline', tint: 'danger' },
  celebration: { icon: 'trophy-outline', tint: 'success' },
  weekly: { icon: 'stats-chart-outline', tint: 'success' },
  backup: { icon: 'shield-checkmark-outline', tint: 'primary' },
  added: { icon: 'checkmark-done-outline', tint: 'success' },
  test: { icon: 'notifications-outline', tint: 'primary' },
};

function when(iso: string, locale: string) {
  const date = new Date(iso);
  const today = dateKey(new Date());
  const day = dateKey(date);
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (day === today) return time;
  if (day === addDays(today, -1)) return null;
  return `${date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function Row({ entry }: { entry: LogEntry }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const swipe = useRef<SwipeableMethods>(null);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const kind = TYPE_ICON[entry.type] ?? TYPE_ICON.test;
  const color = theme[kind.tint];
  const taskIds = (entry.data.taskIds as string[] | undefined) ?? [];
  const label = when(entry.firedAt, locale) ?? `${t('task.yesterday')} · ${new Date(entry.firedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;

  async function act(action: 'done' | 'tomorrow' | 'open') {
    await markRead(entry.id);
    if (action === 'open') {
      const open = entry.data.open as string | undefined;
      if (open === 'task' && taskIds[0]) router.push({ pathname: '/new-task', params: { id: taskIds[0] } });
      else if (open === 'backup') router.push('/backup' as never);
      else router.push('/tasks');
      return;
    }
    try {
      for (const id of taskIds) {
        if (action === 'done') await setLocalTaskCompleted(id, true);
        else await updateLocalTask(id, { dueDate: addDays(dateKey(new Date()), 1) });
      }
      await loadTasks();
      requestReschedule('inbox');
      toast.success(action === 'done' ? t('tasksTab.completedToast') : t('inbox.moved'));
    } catch {
      toast.error(t('home.updateFailed'));
    }
  }

  const actions: { id: 'done' | 'tomorrow' | 'open'; label: string }[] = [
    ...(taskIds.length && (entry.type === 'reminder' || entry.type === 'overdue' || entry.type === 'snooze') ? [{ id: 'done' as const, label: t('notif.actions.done') }] : []),
    ...(entry.type === 'overdue' ? [{ id: 'tomorrow' as const, label: t('notif.actions.tomorrow') }] : []),
    { id: 'open', label: t('notif.actions.open') },
  ];

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={72}
      renderRightActions={() => (
        <View style={[styles.delete, { backgroundColor: theme.danger }]}>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
        </View>
      )}
      onSwipeableOpen={() => void deleteLogEntry(entry.id)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}. ${entry.body}. ${label}`}
        accessibilityActions={[{ name: 'delete', label: t('tasksTab.delete') }]}
        onAccessibilityAction={() => void deleteLogEntry(entry.id)}
        onPress={() => void act('open')}
        style={[styles.row, { backgroundColor: entry.readAt ? theme.card : theme.backgroundSelected, borderColor: theme.border }]}>
        <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
          <Ionicons name={kind.icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.head}>
            <ThemedText style={styles.title} numberOfLines={2}>{entry.title}</ThemedText>
            {!entry.readAt ? <View style={[styles.unread, { backgroundColor: theme.primary }]} /> : null}
          </View>
          {entry.body ? <ThemedText themeColor="textSecondary" style={styles.body} numberOfLines={3}>{entry.body}</ThemedText> : null}
          <ThemedText themeColor="textSecondary" style={styles.time}>{label}</ThemedText>
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                onPress={() => void act(action.id)}
                style={[styles.action, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <ThemedText style={[styles.actionText, { color: theme.primary }]}>{action.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default function InboxScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const entries = useInbox((s) => s.entries);
  const unread = useInbox((s) => s.unread);

  useFocusEffect(useCallback(() => {
    useInbox.getState().refresh();
    requestReschedule('inbox');
  }, []));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.screenTitle}>{t('inbox.title')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('inbox.settings')}
          onPress={() => router.push('/notification-settings' as never)}
          style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="settings-outline" size={20} color={theme.text} />
        </Pressable>
      </View>
      {unread ? (
        <Pressable accessibilityRole="button" onPress={() => void markAllRead()} style={styles.markAll}>
          <Ionicons name="checkmark-done" size={18} color={theme.primary} />
          <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('inbox.markAll', { n: unread })}</ThemedText>
        </Pressable>
      ) : null}
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => <Row entry={item} />}
        ListEmptyComponent={(
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="notifications-off-outline" size={36} color={theme.primary} />
            <ThemedText style={styles.emptyTitle}>{t('inbox.empty')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('inbox.emptyHint')}</ThemedText>
          </View>
        )}
        ListFooterComponent={entries.length ? <ThemedText themeColor="textSecondary" style={styles.footer}>{t('inbox.swipeHint')}</ThemedText> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', minHeight: 40 },
  list: { paddingVertical: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  unread: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  action: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  actionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  delete: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 22 },
  empty: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 14 },
});
