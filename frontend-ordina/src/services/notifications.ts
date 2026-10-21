/**
 * ORDINA local notifications (expo-notifications, no push server).
 *
 * Everything that should fire is planned by features/notification-plan.ts from the tasks and the
 * user's settings, then scheduled on the phone. The plan is rebuilt whenever tasks or settings
 * change and every time the app opens (in case the phone dropped alarms, e.g. after a restart).
 * Action buttons (Done, Snooze, Move to tomorrow...) work without opening the app: a background
 * task handles them (services/notification-task.ts).
 */
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Alert, AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { LOCAL_MODE } from '@/config/release';
import { categoryInfo } from '@/features/categories';
import {
  DEFAULT_SETTINGS,
  dateKey,
  planNotifications,
  renderNotification,
  tomorrowKey,
  type ChannelId,
  type NotificationSettings,
  type PlanTask,
  type PlannedNotification,
} from '@/features/notification-plan';
import { activeLocale, isLocale, setActiveLocale, translate } from '@/i18n/translations';
import {
  getMeta,
  listLocalTasks,
  markOverdueNotified,
  overdueNotifiedIds,
  saveReminderNotificationIds,
  setLocalTaskCompleted,
  setMeta,
  tasksDb,
  updateLocalTask,
} from '@/services/local-tasks';
import { canScheduleExactAlarms, isIgnoringBatteryOptimizations } from '../../modules/ordina-alarms';

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

export const SETTINGS_KEY = 'notificationSettings';
const PROFILE_KEY = 'notificationProfile';
const SNOOZES_KEY = 'notificationSnoozes';
const STATE_KEY = 'notificationState';
const MAX_SCHEDULED = 60;
const LOG_DAYS = 30;

type NotificationState = {
  lastBackupAt?: string | null;
  lastBackupReminderAt?: string | null;
  backupSnoozedUntil?: string | null;
  notNowUntil?: string | null;
  batteryTipShown?: boolean;
  exactTipDismissed?: boolean;
  celebratedOn?: string | null;
  handled?: string[];
};

let modulePromise: Promise<NotificationsModule | null> | null = null;

/** expo-notifications, or null where it cannot run (Expo Go on Android, web). */
export function loadNotifications(): Promise<NotificationsModule | null> {
  if (!modulePromise) {
    modulePromise = (async () => {
      if (Platform.OS === 'web') return null;
      if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return null;
      return import('expo-notifications');
    })().catch(() => null);
  }
  return modulePromise;
}

export async function getSettings(): Promise<NotificationSettings> {
  return { ...DEFAULT_SETTINGS, ...(await getMeta<Partial<NotificationSettings>>(SETTINGS_KEY, {})) };
}

export async function getState(): Promise<NotificationState> {
  return getMeta<NotificationState>(STATE_KEY, {});
}

export async function patchState(patch: Partial<NotificationState>) {
  await setMeta(STATE_KEY, { ...(await getState()), ...patch });
}

// ---------------------------------------------------------------------------------------------
// Channels, action buttons, foreground display

const CHANNELS: { id: ChannelId; importance: 'HIGH' | 'DEFAULT' | 'LOW'; sound: boolean; vibrate: boolean }[] = [
  { id: 'task_reminders', importance: 'HIGH', sound: true, vibrate: true },
  { id: 'daily_planning', importance: 'DEFAULT', sound: true, vibrate: false },
  { id: 'progress', importance: 'LOW', sound: false, vibrate: false },
  { id: 'backup_sync', importance: 'DEFAULT', sound: false, vibrate: false },
];

/** Channels must exist before the permission prompt on Android 13+. Names follow the app language. */
export async function setupChannels() {
  const N = await loadNotifications();
  if (!N || Platform.OS !== 'android') return;
  for (const channel of CHANNELS) {
    await N.setNotificationChannelAsync(channel.id, {
      name: translate(`notif.channels.${channel.id}`),
      description: translate(`notif.channels.${channel.id}Hint`),
      importance: N.AndroidImportance[channel.importance],
      sound: channel.sound ? 'default' : null,
      vibrationPattern: channel.vibrate ? [0, 250, 150, 250] : null,
      enableVibrate: channel.vibrate,
      lightColor: '#5C4DF2',
      showBadge: channel.id !== 'progress',
    });
  }
}

async function setupCategories(N: NotificationsModule) {
  const { snoozeMinutes } = await getSettings().catch(() => DEFAULT_SETTINGS);
  const button = (identifier: string, label: string, opensApp: boolean) => ({
    identifier,
    buttonTitle: translate(label, { n: snoozeMinutes }),
    options: { opensAppToForeground: opensApp },
  });
  await N.setNotificationCategoryAsync('ordina_task', [
    button('done', 'notif.actions.done', false),
    button('snooze', 'notif.actions.snooze', false),
    button('open', 'notif.actions.open', true),
  ]);
  await N.setNotificationCategoryAsync('ordina_evening', [
    button('move_tomorrow', 'notif.actions.moveTomorrow', false),
    button('open', 'notif.actions.open', true),
  ]);
  await N.setNotificationCategoryAsync('ordina_overdue', [
    button('done', 'notif.actions.done', false),
    button('tomorrow', 'notif.actions.tomorrow', false),
  ]);
  await N.setNotificationCategoryAsync('ordina_backup', [
    button('backup_now', 'notif.actions.backupNow', true),
    button('later', 'notif.actions.later', false),
  ]);
}

let handlerSet = false;

function setHandler(N: NotificationsModule) {
  if (handlerSet) return;
  handlerSet = true;
  // Shown while the app is open too (banner + list); only task reminders make a sound.
  N.setNotificationHandler({
    handleNotification: async (notification) => {
      const channel = notification.request.content.data?.channel;
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: channel === 'task_reminders',
        shouldSetBadge: false,
      };
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Permission, asked kindly

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function permissionStatus(): Promise<{ status: PermissionStatus; canAskAgain: boolean }> {
  const N = await loadNotifications();
  if (!N) return { status: 'unavailable', canAskAgain: false };
  const current = await N.getPermissionsAsync();
  if (current.granted) return { status: 'granted', canAskAgain: true };
  return { status: current.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: current.canAskAgain };
}

type PromptState = { visible: boolean; resolve: ((turnOn: boolean) => void) | null };

/** Our own short screen shown before the system prompt (components/notification-prompt.tsx). */
export const useNotificationPrompt = create<PromptState>(() => ({ visible: false, resolve: null }));

/**
 * Asks for notifications the first time they are useful (a reminder is turned on, the intro is
 * finished, the first task is created). Explains first; "Not now" waits 7 days.
 */
export async function askForNotifications(): Promise<boolean> {
  const { status, canAskAgain } = await permissionStatus();
  if (status === 'granted') return true;
  if (status === 'unavailable' || !canAskAgain) return false;
  const state = await getState();
  if (state.notNowUntil && new Date(state.notNowUntil).getTime() > Date.now()) return false;
  if (useNotificationPrompt.getState().visible) return false;
  const turnOn = await new Promise<boolean>((resolve) => useNotificationPrompt.setState({ visible: true, resolve }));
  useNotificationPrompt.setState({ visible: false, resolve: null });
  if (!turnOn) {
    await patchState({ notNowUntil: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    return false;
  }
  return requestSystemPermission();
}

/** The system prompt itself (Settings' switch uses it directly). */
export async function requestSystemPermission() {
  const N = await loadNotifications();
  if (!N) return false;
  await setupChannels();
  const answer = await N.requestPermissionsAsync();
  if (answer.granted) requestReschedule('permission');
  return answer.granted;
}

// ---------------------------------------------------------------------------------------------
// Notification centre log (SQLite, last 30 days)

export type LogEntry = { id: string; type: string; title: string; body: string; data: Record<string, unknown>; firedAt: string; readAt: string | null };

type LogRow = { id: string; type: string; title: string; body: string; data: string | null; fired_at: string; read_at: string | null };

export async function addLogEntry(entry: Omit<LogEntry, 'readAt'>) {
  await (await tasksDb()).runAsync(
    'INSERT OR IGNORE INTO notification_log (id, type, title, body, data, fired_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    entry.id, entry.type, entry.title, entry.body, JSON.stringify(entry.data), entry.firedAt,
  );
  useInbox.getState().refresh();
}

export async function listLog(): Promise<LogEntry[]> {
  const database = await tasksDb();
  const cutoff = new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString();
  await database.runAsync('DELETE FROM notification_log WHERE fired_at < ?', cutoff);
  const rows = await database.getAllAsync<LogRow>('SELECT * FROM notification_log WHERE fired_at <= ? ORDER BY fired_at DESC', new Date().toISOString());
  return rows.map((row) => ({
    id: row.id, type: row.type, title: row.title, body: row.body, firedAt: row.fired_at, readAt: row.read_at,
    data: row.data ? JSON.parse(row.data) as Record<string, unknown> : {},
  }));
}

export const useInbox = create<{ entries: LogEntry[]; unread: number; refresh: () => void }>((set) => ({
  entries: [],
  unread: 0,
  refresh: () => {
    void listLog().then((entries) => set({ entries, unread: entries.filter((entry) => !entry.readAt).length })).catch(() => undefined);
  },
}));

export async function markAllRead() {
  await (await tasksDb()).runAsync('UPDATE notification_log SET read_at = ? WHERE read_at IS NULL', new Date().toISOString());
  useInbox.getState().refresh();
}

export async function markRead(id: string) {
  await (await tasksDb()).runAsync('UPDATE notification_log SET read_at = ? WHERE id = ? AND read_at IS NULL', new Date().toISOString(), id);
  useInbox.getState().refresh();
}

export async function deleteLogEntry(id: string) {
  await (await tasksDb()).runAsync('DELETE FROM notification_log WHERE id = ?', id);
  useInbox.getState().refresh();
}

/** Planned notifications whose time has passed go into the centre (they were shown by Android). */
async function logFired(now: Date) {
  const database = await tasksDb();
  const fired = await database.getAllAsync<{ key: string; type: string; fire_at: string; title: string; body: string; data: string | null }>(
    'SELECT * FROM planned_notifications WHERE fire_at <= ?', now.toISOString(),
  );
  const overdue: string[] = [];
  for (const row of fired) {
    const data = row.data ? JSON.parse(row.data) as Record<string, unknown> : {};
    await database.runAsync(
      'INSERT OR IGNORE INTO notification_log (id, type, title, body, data, fired_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      String(data.logId ?? `${row.key}@${row.fire_at}`), row.type, row.title, row.body, row.data, row.fire_at,
    );
    if (row.type === 'overdue') overdue.push(...((data.taskIds as string[]) ?? []));
    if (row.type === 'backup') await patchState({ lastBackupReminderAt: row.fire_at });
  }
  if (overdue.length) await markOverdueNotified(overdue);
  await database.runAsync('DELETE FROM planned_notifications WHERE fire_at <= ?', now.toISOString());
  return fired;
}

async function sentToday(now: Date) {
  // Non-reminder notifications already shown today (local day), for the daily cap.
  const rows = await (await tasksDb()).getAllAsync<{ fired_at: string }>(
    `SELECT fired_at FROM notification_log WHERE fired_at >= ? AND type NOT IN ('reminder', 'reminderGroup', 'snooze', 'test')`,
    new Date(now.getTime() - 86_400_000).toISOString(),
  );
  const day = dateKey(now);
  return { [day]: rows.filter((row) => dateKey(new Date(row.fired_at)) === day).length };
}

// ---------------------------------------------------------------------------------------------
// Planning and scheduling

export function formatClock(time: string, locale = activeLocale()) {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return time;
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** Saves what background work needs (first name, language) so it speaks like the app. */
export async function rememberProfile(profile: { firstName?: string | null; locale?: string; serverBackup?: boolean }) {
  const current = await getMeta<Record<string, unknown>>(PROFILE_KEY, {});
  await setMeta(PROFILE_KEY, { ...current, ...profile });
}

async function tasksForPlanning(): Promise<PlanTask[]> {
  if (LOCAL_MODE) return listLocalTasks();
  // Server tasks: their reminders are kept on this phone.
  const { useTasksStore } = await import('@/store/tasks-store');
  const rows = await (await tasksDb()).getAllAsync<{ task_id: string; lead_minutes: number | null; at_time: string | null }>(
    'SELECT task_id, lead_minutes, at_time FROM task_reminders',
  );
  const byId = new Map(rows.map((row) => [row.task_id, row]));
  return useTasksStore.getState().tasks.map((task) => ({
    ...task,
    reminderLead: byId.get(task.id)?.lead_minutes ?? task.reminderLead ?? null,
    reminderTime: byId.get(task.id)?.at_time ?? task.reminderTime ?? null,
  }));
}

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Re-plans all notifications soon (several changes in a row are combined). */
export function requestReschedule(_reason?: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void rescheduleAll();
  }, 400);
}

export async function rescheduleAll(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      await rescheduleOnce();
    } catch {
      // Notifications are best-effort: never break the app.
    }
  })();
  await running;
  running = null;
  if (again) {
    again = false;
    await rescheduleAll();
  }
}

async function rescheduleOnce() {
  const N = await loadNotifications();
  if (!N) return;
  const now = new Date();
  const profile = await getMeta<{ firstName?: string | null; locale?: string; serverBackup?: boolean }>(PROFILE_KEY, {});
  if (profile.locale && isLocale(profile.locale)) setActiveLocale(profile.locale);
  await logFired(now);
  useInbox.getState().refresh();
  const { granted } = await N.getPermissionsAsync();
  await N.cancelAllScheduledNotificationsAsync();
  const database = await tasksDb();
  await database.runAsync('DELETE FROM planned_notifications');
  if (!granted) return;

  const [settings, tasks, state, snoozes, notified, sent] = await Promise.all([
    getSettings(),
    tasksForPlanning(),
    getState(),
    getMeta<Record<string, string>>(SNOOZES_KEY, {}),
    overdueNotifiedIds(),
    sentToday(now),
  ]);
  const openIds = new Set(tasks.filter((task) => !task.completed).map((task) => task.id));
  const liveSnoozes = Object.fromEntries(Object.entries(snoozes).filter(([id, when]) => openIds.has(id) && new Date(when).getTime() > now.getTime()));
  if (Object.keys(liveSnoozes).length !== Object.keys(snoozes).length) await setMeta(SNOOZES_KEY, liveSnoozes);

  const plan = planNotifications(tasks, settings, {
    now,
    snoozes: liveSnoozes,
    overdueNotified: notified,
    lastBackupAt: state.lastBackupAt,
    lastBackupReminderAt: state.lastBackupReminderAt,
    backupSnoozedUntil: state.backupSnoozedUntil,
    sentToday: sent,
    serverBackup: profile.serverBackup,
  }).slice(0, MAX_SCHEDULED);

  const reminderIds: Record<string, string | null> = {};
  for (const item of plan) {
    const id = await schedule(N, item, profile.firstName);
    if (id && (item.type === 'reminder' || item.type === 'snooze' || item.type === 'reminderGroup')) {
      for (const taskId of item.taskIds) reminderIds[taskId] = id;
    }
  }
  await saveReminderNotificationIds(reminderIds);
}

function render(item: PlannedNotification, firstName?: string | null) {
  return renderNotification(item, {
    t: translate,
    firstName,
    formatTime: (time) => formatClock(time),
    categoryName: (id) => {
      const info = categoryInfo(id);
      return info.name || translate(`categories.defaults.${info.id}`);
    },
  });
}

async function schedule(N: NotificationsModule, item: PlannedNotification, firstName?: string | null) {
  const { title, body } = render(item, firstName);
  const logId = `${item.key}@${item.fireAt.toISOString()}`;
  const data = { type: item.type, key: item.key, taskIds: item.taskIds, open: item.open, channel: item.channel, logId };
  const id = await N.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      categoryIdentifier: item.category === 'ordina_open' ? undefined : item.category,
      sound: item.channel === 'task_reminders' ? 'default' : undefined,
      color: '#5C4DF2',
    },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: item.fireAt, channelId: item.channel },
  });
  await (await tasksDb()).runAsync(
    'INSERT OR REPLACE INTO planned_notifications (key, notification_id, type, fire_at, title, body, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
    item.key, id, item.type, item.fireAt.toISOString(), title, body, JSON.stringify(data),
  );
  return id;
}

/** Shows a notification now (celebrations, "tasks added" while in the background, tests). */
export async function presentNow(channel: ChannelId, title: string, body: string, extra: Record<string, unknown> = {}) {
  const N = await loadNotifications();
  if (!N || !(await N.getPermissionsAsync()).granted) return null;
  const logId = `now_${Crypto.randomUUID()}`;
  const data = { ...extra, channel, logId };
  const id = await N.scheduleNotificationAsync({
    content: { title, body, data, color: '#5C4DF2', sound: channel === 'task_reminders' ? 'default' : undefined },
    trigger: Platform.OS === 'android' ? { channelId: channel } : null,
  });
  await addLogEntry({ id: logId, type: String(extra.type ?? channel), title, body, data, firedAt: new Date().toISOString() });
  return id;
}

/** Settings → "Send a test notification", and the 1-minute test in preview builds. */
export async function sendTestNotification(inMinutes = 0) {
  const N = await loadNotifications();
  if (!N || !(await N.getPermissionsAsync()).granted) return false;
  const title = translate('notif.test.title');
  const body = translate('notif.test.body');
  if (!inMinutes) {
    await presentNow('task_reminders', title, body, { type: 'test' });
    return true;
  }
  await N.scheduleNotificationAsync({
    content: { title, body, data: { type: 'test', channel: 'task_reminders' }, categoryIdentifier: undefined, color: '#5C4DF2', sound: 'default' },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + inMinutes * 60_000), channelId: 'task_reminders' },
  });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Celebrations

/** All of today's tasks are done: celebrate once a day, in the app if it is open. */
export async function celebrateIfAllDone(onInApp?: (title: string, body: string) => void) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.celebrations) return;
  const today = dateKey(new Date());
  const tasks = (await tasksForPlanning()).filter((task) => task.dueDate === today);
  if (!tasks.length || tasks.some((task) => !task.completed)) return;
  const state = await getState();
  if (state.celebratedOn === today) return;
  await patchState({ celebratedOn: today });
  const title = translate('notif.celebrate.title');
  const body = translate(tasks.length === 1 ? 'notif.celebrate.bodyOne' : 'notif.celebrate.body', { n: tasks.length });
  if (AppState.currentState === 'active' && onInApp) onInApp(title, body);
  else await presentNow('progress', title, body, { type: 'celebration', open: 'today' });
}

// ---------------------------------------------------------------------------------------------
// Actions (Done, Snooze, Move to tomorrow...), in the app or in the background

async function moveToTomorrow(taskIds: string[]) {
  const tomorrow = tomorrowKey(new Date());
  for (const id of taskIds) await updateLocalTask(id, { dueDate: tomorrow });
}

/**
 * Handles a tap on a notification or one of its buttons. Runs once per response, even when both
 * the in-app listener and the background task receive it.
 */
export async function handleResponse(response: NotificationResponse, options: { navigate: boolean }) {
  const N = await loadNotifications();
  const request = response.notification.request;
  const data = (request.content.data ?? {}) as { type?: string; taskIds?: string[]; open?: string; logId?: string };
  const action = response.actionIdentifier;
  const marker = `${request.identifier}|${action}`;
  const state = await getState();
  if (state.handled?.includes(marker)) return;
  await patchState({ handled: [...(state.handled ?? []).slice(-40), marker] });
  if (data.logId) await markRead(data.logId).catch(() => undefined);
  const taskIds = data.taskIds ?? [];
  const settings = await getSettings();
  const dismiss = () => N?.dismissNotificationAsync(request.identifier).catch(() => undefined);

  switch (action) {
    case 'done':
      for (const id of taskIds) await setLocalTaskCompleted(id, true);
      await dismiss();
      await celebrateIfAllDone();
      break;
    case 'snooze': {
      const snoozes = await getMeta<Record<string, string>>(SNOOZES_KEY, {});
      const until = new Date(Date.now() + settings.snoozeMinutes * 60_000).toISOString();
      for (const id of taskIds) snoozes[id] = until;
      await setMeta(SNOOZES_KEY, snoozes);
      await dismiss();
      break;
    }
    case 'tomorrow':
      await moveToTomorrow(taskIds);
      await dismiss();
      break;
    case 'move_tomorrow': {
      const today = dateKey(new Date());
      const left = (await listLocalTasks()).filter((task) => task.dueDate === today && !task.completed).map((task) => task.id);
      await moveToTomorrow(left);
      await dismiss();
      break;
    }
    case 'later':
      await patchState({ backupSnoozedUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(), lastBackupReminderAt: new Date().toISOString() });
      await dismiss();
      break;
    default:
      if (options.navigate) openTarget(action === 'backup_now' ? 'backup' : data.open, taskIds);
  }
  await rescheduleAll();
  if (options.navigate || AppState.currentState === 'active') {
    const { useTasksStore } = await import('@/store/tasks-store');
    void useTasksStore.getState().loadTasks();
  }
}

function openTarget(target: string | undefined, taskIds: string[]) {
  try {
    if (target === 'task' && taskIds[0]) router.push({ pathname: '/new-task', params: { id: taskIds[0] } });
    else if (target === 'backup') router.push('/backup' as never);
    else if (target === 'today') router.push({ pathname: '/tasks', params: { date: dateKey(new Date()), at: String(Date.now()) } });
    else router.push('/tasks');
  } catch {
    // Navigation is not ready yet (cold start): the root layout opens it from the last response.
  }
}

// ---------------------------------------------------------------------------------------------
// Start-up

export const useNotificationTips = create<{ battery: boolean }>(() => ({ battery: false }));

/** Reminders that should have shown in the last 12 hours while Android may be stopping ORDINA. */
async function checkMissedReminders(fired: { type: string; fire_at: string }[]) {
  if (Platform.OS !== 'android') return;
  const state = await getState();
  if (state.batteryTipShown || isIgnoringBatteryOptimizations()) return;
  const recent = fired.some((row) => (row.type === 'reminder' || row.type === 'reminderGroup')
    && Date.now() - new Date(row.fire_at).getTime() < 12 * 3_600_000);
  if (recent) useNotificationTips.setState({ battery: true });
}

let started = false;

/** Called once at app start: channels, buttons, listeners, background task, and a full re-plan. */
export async function initNotifications(profile: { firstName?: string | null; locale: string; serverBackup?: boolean }) {
  const N = await loadNotifications();
  await rememberProfile(profile).catch(() => undefined);
  if (!N) return () => undefined;
  setHandler(N);
  await setupChannels().catch(() => undefined);
  await setupCategories(N).catch(() => undefined);
  if (!started) {
    started = true;
    const { NOTIFICATION_TASK } = await import('@/services/notification-task');
    await N.registerTaskAsync(NOTIFICATION_TASK).catch(() => undefined);
  }
  const received = N.addNotificationReceivedListener((notification) => {
    const { content } = notification.request;
    const data = (content.data ?? {}) as Record<string, unknown>;
    if (data.logId) {
      void addLogEntry({
        id: String(data.logId), type: String(data.type ?? 'reminder'), title: content.title ?? '', body: content.body ?? '', data,
        firedAt: new Date().toISOString(),
      });
    }
  });
  const responses = N.addNotificationResponseReceivedListener((response) => {
    void handleResponse(response, { navigate: true });
  });
  // Opened by tapping a notification while the app was closed.
  const last = await N.getLastNotificationResponseAsync().catch(() => null);
  if (last) setTimeout(() => void handleResponse(last, { navigate: true }), 600);

  const fired = await (await tasksDb()).getAllAsync<{ type: string; fire_at: string }>(
    'SELECT type, fire_at FROM planned_notifications WHERE fire_at <= ?', new Date().toISOString(),
  ).catch(() => []);
  await rescheduleAll();
  await checkMissedReminders(fired).catch(() => undefined);
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') requestReschedule('foreground');
  });
  return () => {
    received.remove();
    responses.remove();
    appState.remove();
  };
}

/** For Settings: whether reminders can fire exactly on time on this phone. */
export function exactAlarmsAllowed() {
  return Platform.OS !== 'android' || canScheduleExactAlarms();
}

export function batteryUnrestricted() {
  return Platform.OS !== 'android' || isIgnoringBatteryOptimizations();
}

// ---------------------------------------------------------------------------------------------
// Older helpers still used by server-only screens (integrations, server reminders, arrival watch)

export async function getNotificationPermission() {
  return (await permissionStatus()).status;
}

export async function ensureNotificationPermission() {
  return (await requestSystemPermission()) ? 'granted' : (await permissionStatus()).status;
}

export async function scheduleLocalReminder(title: string, body: string, when: Date, data?: Record<string, string>) {
  const N = await loadNotifications();
  if (!N || !(await N.getPermissionsAsync()).granted || when.getTime() <= Date.now()) return null;
  return N.scheduleNotificationAsync({
    content: { title, body, data: { ...data, channel: 'task_reminders' }, color: '#5C4DF2' },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'task_reminders' },
  });
}

export async function presentImmediateNotification(title: string, body: string) {
  const id = await presentNow('task_reminders', title, body, { type: 'arrival' });
  if (!id) Alert.alert(title, body);
  return id;
}

/** The app language or the user's name changed: channel names, buttons and texts follow. */
export async function refreshNotificationLanguage(profile: { firstName?: string | null; locale: string }) {
  await rememberProfile(profile).catch(() => undefined);
  const N = await loadNotifications();
  if (!N) return;
  await setupChannels().catch(() => undefined);
  await setupCategories(N).catch(() => undefined);
  requestReschedule('language');
}

/** Snooze length changed: the button reads "Snooze 5 min" etc. */
export async function refreshActionButtons() {
  const N = await loadNotifications();
  if (N) await setupCategories(N).catch(() => undefined);
}
