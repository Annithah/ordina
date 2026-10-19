/**
 * Local notifications (expo-notifications): they are scheduled on the phone, so they work
 * offline. Scheduling never asks for permission by itself; the app asks once, with an
 * explanation, when the user first turns a reminder on (requestNotificationPermission).
 */
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';

import { translate } from '@/i18n';

type NotificationsModule = typeof import('expo-notifications');
export type PermissionResult = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const CHANNEL_ID = 'ordina-reminders';
let handlerConfigured = false;
let channelReady = false;

/** null where local notifications cannot work (web, Android Expo Go). */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return null;
  try {
    const notifications = await import('expo-notifications');
    if (!handlerConfigured) {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerConfigured = true;
    }
    return notifications;
  } catch {
    return null;
  }
}

async function ensureChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: translate('reminders.channel'),
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

export async function getNotificationPermission(): Promise<PermissionResult> {
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return current.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Shows the system permission prompt if it may still be shown. */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  try {
    const current = await getNotificationPermission();
    if (current === 'granted') return 'granted';
    const next = await Notifications.requestPermissionsAsync();
    if (next.granted) return 'granted';
    return next.status === 'denied' || !next.canAskAgain ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Kept for the older integrations screen. */
export const ensureNotificationPermission = requestNotificationPermission;

/**
 * Schedules (or replaces) the notification with this identifier. Returns false when it was not
 * scheduled: no permission, unavailable, or a time in the past.
 */
export async function scheduleAt(identifier: string, when: Date, content: { title: string; body: string; data?: Record<string, string> }) {
  const Notifications = await loadNotifications();
  if (!Notifications || when.getTime() <= Date.now()) return false;
  if ((await getNotificationPermission()) !== 'granted') return false;
  await ensureChannel(Notifications);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: content.title, body: content.body, data: content.data ?? {} },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
  });
  return true;
}

export async function cancelScheduled(identifier: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
}

/** Identifiers of scheduled notifications that start with `prefix`. */
export async function scheduledIds(prefix: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return [];
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).map((item) => item.identifier).filter((id) => id.startsWith(prefix));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- older screens (not in this build)

export async function scheduleLocalReminder(title: string, body: string, when: Date, data?: Record<string, string>) {
  const identifier = `misc-${when.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  return (await scheduleAt(identifier, when, { title, body, data })) ? identifier : null;
}

export async function cancelTaskReminder(taskId: string) {
  await cancelScheduled(`task-${taskId}`);
}

export async function scheduleTaskReminder(taskId: string, title: string, when: Date, data?: Record<string, string>) {
  const { body, ...rest } = data ?? {};
  const identifier = `task-${taskId}`;
  return (await scheduleAt(identifier, when, { title, body: body || title, data: { ...rest, type: 'task', taskId } })) ? identifier : null;
}

export async function presentImmediateNotification(title: string, body: string) {
  const Notifications = await loadNotifications();
  if (Notifications && (await getNotificationPermission()) === 'granted') {
    await ensureChannel(Notifications);
    return Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  }
  Alert.alert(title, body);
  return null;
}
