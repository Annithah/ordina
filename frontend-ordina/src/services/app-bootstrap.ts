/**
 * Start-up work for the whole app: load settings and tasks from the phone, keep reminders in
 * step, and open the right screen when a notification is tapped (also when it started the app).
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { loadNotifications } from '@/services/notifications';
import { rescheduleAll } from '@/services/task-reminders';
import { onSettingsChanged, useSettingsStore } from '@/store/settings-store';
import { useTasksStore } from '@/store/tasks-store';

type Data = { type?: string; taskId?: string } | undefined;

function openFromNotification(data: Data) {
  if (!data) return;
  if (data.type === 'task' && data.taskId) router.push({ pathname: '/new-task', params: { id: data.taskId } });
  else if (data.type === 'backup') router.push('/backup');
}

export function useAppBootstrap() {
  useEffect(() => {
    let alive = true;
    void (async () => {
      await useSettingsStore.getState().load();
      await useTasksStore.getState().loadTasks();
      if (alive) await rescheduleAll(useTasksStore.getState().tasks).catch(() => undefined);
    })();
    const offSettings = onSettingsChanged((changes) => {
      if ('remindersEnabled' in changes) void rescheduleAll(useTasksStore.getState().tasks).catch(() => undefined);
    });
    return () => {
      alive = false;
      offSettings();
    };
  }, []);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let alive = true;
    void loadNotifications().then(async (Notifications) => {
      if (!Notifications || !alive) return;
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        openFromNotification(response.notification.request.content.data as Data);
      });
      // The app was opened by tapping a notification.
      const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (last && alive) {
        // Wait for the first screen to mount before navigating.
        setTimeout(() => openFromNotification(last.notification.request.content.data as Data), 1800);
        Notifications.clearLastNotificationResponse();
      }
    });
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, []);
}
