/**
 * "✓ 3 tasks added — 2 today, 1 tomorrow": confirmation after creating tasks. In the app it is a
 * toast with Undo and View; as a phone notification only when the app is in the background or
 * the user asked for it in Settings.
 */
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { toast } from '@/components/toast';
import { addDays, dateKey } from '@/features/notification-plan';
import { translate } from '@/i18n/translations';
import { askForNotifications, getSettings, presentNow, requestReschedule } from '@/services/notifications';
import { useTasksStore } from '@/store/tasks-store';

type Created = { id: string; dueDate?: string | null };

/** "3 tasks added — 2 today, 1 tomorrow" in the app language. */
export function tasksAddedMessage(created: Created[], now = new Date()) {
  const today = dateKey(now);
  const tomorrow = addDays(today, 1);
  const onToday = created.filter((task) => task.dueDate === today).length;
  const onTomorrow = created.filter((task) => task.dueDate === tomorrow).length;
  const later = created.length - onToday - onTomorrow;
  const parts = [
    onToday ? translate('feedback.today', { n: onToday }) : null,
    onTomorrow ? translate('feedback.tomorrow', { n: onTomorrow }) : null,
    later ? translate('feedback.later', { n: later }) : null,
  ].filter(Boolean);
  const head = created.length === 1 ? translate('feedback.addedOne') : translate('feedback.added', { n: created.length });
  return parts.length > 1 || (parts.length === 1 && created.length > 1) ? `${head} — ${parts.join(', ')}` : head;
}

export async function announceTasksAdded(created: Created[], options: { undo?: boolean } = {}) {
  if (!created.length) return;
  const message = `✓ ${tasksAddedMessage(created)}`;
  const settings = await getSettings().catch(() => null);
  if (AppState.currentState !== 'active' || settings?.taskAdded === 'notify') {
    void presentNow('daily_planning', translate('feedback.notifTitle'), message, { type: 'added', open: 'tasks' });
  }
  if (AppState.currentState === 'active') {
    const actions = [
      ...(options.undo === false ? [] : [{
        label: translate('tasksTab.undo'),
        onPress: () => {
          const { deleteTask } = useTasksStore.getState();
          void Promise.all(created.map((task) => deleteTask(task.id))).then(() => toast.info(translate('feedback.undone')));
        },
      }]),
      { label: translate('feedback.view'), onPress: () => router.push('/tasks') },
    ];
    toast.actions('success', message, actions, 6000);
  }
  requestReschedule('added');
  // The first task is a good moment to offer reminders (asked once, kindly).
  void askForNotifications();
}
