import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

let asked = false;
let handlerConfigured = false;
const SCHEDULED_REMINDERS_KEY = 'ordina.scheduledReminderIds.v1';

type NotificationsModule = typeof import('expo-notifications');

async function loadNotifications(): Promise<NotificationsModule | null> {
  // Notifications are deferred until the native development build is ready.
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return null;
  const notifications = await import('expo-notifications');
  if (!handlerConfigured) {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  }
  return notifications;
}

async function readScheduledReminderIds(): Promise<Record<string, string>> {
  const value = Platform.OS === 'web'
    ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(SCHEDULED_REMINDERS_KEY))
    : await SecureStore.getItemAsync(SCHEDULED_REMINDERS_KEY);
  return value ? JSON.parse(value) as Record<string, string> : {};
}

async function writeScheduledReminderIds(value: Record<string, string>) {
  const serialized = JSON.stringify(value);
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    localStorage.setItem(SCHEDULED_REMINDERS_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(SCHEDULED_REMINDERS_KEY, serialized);
}

export async function getNotificationPermission() {
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return current.status;
}

export async function ensureNotificationPermission() {
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (current.status === 'denied') return 'denied';
  if (asked) return current.status;
  asked = true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted ? 'granted' : next.status;
}

export async function scheduleLocalReminder(title: string, body: string, when: Date, data?: Record<string, string>) {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  const permission = await ensureNotificationPermission();
  if (permission !== 'granted') return null;
  if (when.getTime() <= Date.now()) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ordina-reminders', {
      name: 'ORDINA reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

export async function cancelTaskReminder(taskId: string) {
  const ids = await readScheduledReminderIds();
  const identifier = ids[taskId];
  if (!identifier) return;
  const Notifications = await loadNotifications();
  if (Notifications) await Notifications.cancelScheduledNotificationAsync(identifier);
  delete ids[taskId];
  await writeScheduledReminderIds(ids);
}

export async function scheduleTaskReminder(
  taskId: string,
  title: string,
  when: Date,
  data?: Record<string, string>,
) {
  await cancelTaskReminder(taskId);
  const { body, ...rest } = data ?? {};
  const identifier = await scheduleLocalReminder(title, body || 'Task reminder', when, {
    ...rest,
    type: 'task',
    taskId,
  });
  if (!identifier) return null;
  try {
    const ids = await readScheduledReminderIds();
    ids[taskId] = identifier;
    await writeScheduledReminderIds(ids);
  } catch (error) {
    const Notifications = await loadNotifications();
    if (Notifications) await Notifications.cancelScheduledNotificationAsync(identifier);
    throw error;
  }
  return identifier;
}

export async function presentImmediateNotification(title: string, body: string) {
  const Notifications = await loadNotifications();
  if (Notifications) {
    const permission = await ensureNotificationPermission();
    if (permission === 'granted') {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('ordina-reminders', {
          name: 'ORDINA reminders',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      return Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
    }
  }
  Alert.alert(title, body);
  return null;
}
