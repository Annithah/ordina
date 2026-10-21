/**
 * Which local notifications ORDINA schedules, and what they say. Pure (no Expo, no React) so
 * the rules can be unit tested: reminders, grouping, morning plan, evening check-in, overdue
 * nudges, weekly summary, backup reminders, quiet hours and the daily cap.
 */

export type ChannelId = 'task_reminders' | 'daily_planning' | 'progress' | 'backup_sync';

export type NotificationType =
  | 'reminder'
  | 'reminderGroup'
  | 'snooze'
  | 'morning'
  | 'planPrompt'
  | 'evening'
  | 'overdue'
  | 'weekly'
  | 'backup';

/** Action button sets (Android notification categories; no ":" or "-" in ids). */
export type CategoryId = 'ordina_task' | 'ordina_evening' | 'ordina_overdue' | 'ordina_backup' | 'ordina_open';

export type NotificationSettings = {
  enabled: boolean;
  reminders: boolean;
  /** Minutes before the start for new tasks (0 = at start). */
  defaultLead: number;
  snoozeMinutes: 5 | 10 | 15;
  morning: boolean;
  morningTime: string;
  /** On days without tasks: "Nothing planned yet — want help planning today?" */
  planPrompt: boolean;
  evening: boolean;
  eveningTime: string;
  overdue: boolean;
  taskAdded: 'inApp' | 'notify';
  celebrations: boolean;
  weekly: boolean;
  backup: boolean;
  backupFrequency: 'weekly' | 'monthly';
  quiet: boolean;
  quietStart: string;
  quietEnd: string;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  reminders: true,
  defaultLead: 15,
  snoozeMinutes: 10,
  morning: true,
  morningTime: '07:00',
  planPrompt: false,
  evening: true,
  eveningTime: '20:00',
  overdue: true,
  taskAdded: 'inApp',
  celebrations: true,
  weekly: false,
  backup: true,
  backupFrequency: 'weekly',
  quiet: true,
  quietStart: '22:00',
  quietEnd: '06:00',
};

/** Reminder choices on a task, in minutes before its start. */
export const REMINDER_LEADS = [0, 5, 15, 30, 60, 1440];

/** At most this many notifications per day that are not task reminders. */
export const DAILY_CAP = 6;
/** Reminders this close together become one ("3 tasks starting soon"). */
export const GROUP_WINDOW_MINUTES = 5;
/** How far ahead reminders are scheduled (they are re-planned every time the app opens). */
export const PLAN_DAYS = 7;

export type PlanTask = {
  id: string;
  title: string;
  dueDate?: string;
  startTime?: string;
  duration?: string;
  completed: boolean;
  category?: string;
  reminderLead?: number | null;
  reminderTime?: string | null;
  updatedAt?: string;
};

export type PlannedNotification = {
  /** Stable id: the same reminder keeps its key when re-planned. */
  key: string;
  type: NotificationType;
  channel: ChannelId;
  category: CategoryId;
  fireAt: Date;
  taskIds: string[];
  /** Values the text needs (titles, times, counts). */
  vars: Record<string, string | number>;
  /** Navigation target when tapped. */
  open: 'task' | 'today' | 'tasks' | 'backup';
};

export type PlanContext = {
  now: Date;
  /** Snoozed reminders: task id -> when to remind again. */
  snoozes?: Record<string, string>;
  overdueNotified?: Set<string>;
  lastBackupAt?: string | null;
  lastBackupReminderAt?: string | null;
  backupSnoozedUntil?: string | null;
  /** Non-reminder notifications already shown, per day ("YYYY-MM-DD" -> count). */
  sentToday?: Record<string, number>;
  /** Signed in with automatic server backup: no backup reminders. */
  serverBackup?: boolean;
};

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

export function minutesOf(time?: string | null) {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function at(key: string, time: string) {
  const [y, m, d] = key.split('-').map(Number);
  const minutes = minutesOf(time) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function durationMinutes(duration?: string) {
  const hours = /(\d+)\s*h/.exec(duration ?? '');
  const mins = /(\d+)\s*m/.exec(duration ?? '');
  const total = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  return total || 60;
}

/** When a task's reminder fires, or null (no reminder, done, Anytime without a time). */
export function reminderFireTime(task: PlanTask): Date | null {
  if (task.completed || !task.dueDate || task.reminderLead === null || task.reminderLead === undefined) return null;
  if (task.startTime && minutesOf(task.startTime) !== null) {
    return new Date(at(task.dueDate, task.startTime).getTime() - task.reminderLead * 60_000);
  }
  // Anytime: at the time the user picked; otherwise the morning plan covers it.
  return task.reminderTime ? at(task.dueDate, task.reminderTime) : null;
}

/** True when `date` falls inside quiet hours (which may cross midnight, e.g. 22:00-06:00). */
export function inQuietHours(date: Date, settings: Pick<NotificationSettings, 'quiet' | 'quietStart' | 'quietEnd'>) {
  if (!settings.quiet) return false;
  const start = minutesOf(settings.quietStart);
  const end = minutesOf(settings.quietEnd);
  if (start === null || end === null || start === end) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** The first moment after quiet hours end. */
export function afterQuietHours(date: Date, settings: Pick<NotificationSettings, 'quiet' | 'quietStart' | 'quietEnd'>) {
  if (!inQuietHours(date, settings)) return date;
  const end = at(dateKey(date), settings.quietEnd);
  return end.getTime() > date.getTime() ? end : new Date(end.getTime() + 86_400_000);
}

/** Lower number = kept first when the daily cap is reached. */
const PRIORITY: Partial<Record<NotificationType, number>> = { morning: 1, evening: 2, overdue: 3, planPrompt: 4, weekly: 5, backup: 6 };

const isReminder = (type: NotificationType) => type === 'reminder' || type === 'reminderGroup' || type === 'snooze';

/**
 * Every notification to schedule from `now` on, already filtered by the user's settings,
 * quiet hours, the daily cap and grouping. Re-planned whenever tasks or settings change.
 */
export function planNotifications(tasks: PlanTask[], settings: NotificationSettings, context: PlanContext): PlannedNotification[] {
  if (!settings.enabled) return [];
  const { now } = context;
  const today = dateKey(now);
  const lastDay = addDays(today, PLAN_DAYS);
  const open = tasks.filter((task) => !task.completed);
  const plan: PlannedNotification[] = [];

  // 1. Task reminders (allowed in quiet hours: the user chose them), then grouped.
  if (settings.reminders) {
    const reminders: PlannedNotification[] = [];
    for (const task of open) {
      if (!task.dueDate || task.dueDate > lastDay) continue;
      const snoozed = context.snoozes?.[task.id];
      const fireAt = snoozed ? new Date(snoozed) : reminderFireTime(task);
      if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
      reminders.push({
        key: `${snoozed ? 'snooze' : 'reminder'}_${task.id}`,
        type: snoozed ? 'snooze' : 'reminder',
        channel: 'task_reminders',
        category: 'ordina_task',
        fireAt,
        taskIds: [task.id],
        vars: {
          title: task.title,
          start: task.startTime ?? '',
          end: task.startTime ? timeAfter(task.startTime, durationMinutes(task.duration)) : '',
          lead: snoozed ? 0 : task.reminderLead ?? 0,
          category: task.category ?? '',
        },
        open: 'task',
      });
    }
    plan.push(...groupReminders(reminders));
  }

  // 2. Daily planning: morning plan and evening check-in, today and the next two days.
  const byDay = (key: string) => open.filter((task) => task.dueDate === key)
    .sort((a, b) => (minutesOf(a.startTime) ?? 24 * 60) - (minutesOf(b.startTime) ?? 24 * 60));
  for (let offset = 0; offset < 3; offset += 1) {
    const key = addDays(today, offset);
    const dayTasks = byDay(key);
    if (settings.morning) {
      const fireAt = at(key, settings.morningTime);
      if (dayTasks.length) {
        const first = dayTasks[0];
        plan.push({
          key: `morning_${key}`, type: 'morning', channel: 'daily_planning', category: 'ordina_open', fireAt, taskIds: dayTasks.map((task) => task.id),
          vars: { count: dayTasks.length, first: first.title, firstTime: first.startTime ?? '' }, open: 'today',
        });
      } else if (settings.planPrompt) {
        plan.push({ key: `plan_${key}`, type: 'planPrompt', channel: 'daily_planning', category: 'ordina_open', fireAt, taskIds: [], vars: {}, open: 'today' });
      }
    }
    // The evening check-in is only known for today (tomorrow's tasks may still be finished early).
    if (settings.evening && offset === 0 && dayTasks.length) {
      plan.push({
        key: `evening_${key}`, type: 'evening', channel: 'daily_planning', category: 'ordina_evening', fireAt: at(key, settings.eveningTime),
        taskIds: dayTasks.map((task) => task.id), vars: { count: dayTasks.length }, open: 'today',
      });
    }
  }

  // 3. Overdue nudge: once, 1 hour after a timed task's start, never repeated.
  if (settings.overdue) {
    for (const task of open) {
      if (!task.dueDate || !task.startTime || task.dueDate > lastDay || context.overdueNotified?.has(task.id)) continue;
      const fireAt = new Date(at(task.dueDate, task.startTime).getTime() + 60 * 60_000);
      plan.push({
        key: `overdue_${task.id}`, type: 'overdue', channel: 'task_reminders', category: 'ordina_overdue', fireAt,
        taskIds: [task.id], vars: { title: task.title, start: task.startTime }, open: 'task',
      });
    }
  }

  // 4. Weekly summary: Sunday 19:00.
  if (settings.weekly) {
    const daysToSunday = (7 - now.getDay()) % 7;
    const sunday = addDays(today, daysToSunday);
    const weekStart = addDays(sunday, -6);
    const done = tasks.filter((task) => task.completed && task.dueDate && task.dueDate >= weekStart && task.dueDate <= sunday);
    if (done.length) {
      const counts = new Map<string, number>();
      for (const task of done) counts.set(task.category ?? 'other', (counts.get(task.category ?? 'other') ?? 0) + 1);
      const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      plan.push({
        key: `weekly_${sunday}`, type: 'weekly', channel: 'progress', category: 'ordina_open', fireAt: at(sunday, '19:00'),
        taskIds: [], vars: { count: done.length, category: busiest }, open: 'tasks',
      });
    }
  }

  // 5. Backup reminder: never more than once a week, "Later" waits 3 days.
  if (settings.backup && !context.serverBackup) {
    const every = settings.backupFrequency === 'monthly' ? 30 : 7;
    const due = !context.lastBackupAt || now.getTime() - new Date(context.lastBackupAt).getTime() >= every * 86_400_000;
    const recentlyAsked = context.lastBackupReminderAt && now.getTime() - new Date(context.lastBackupReminderAt).getTime() < 7 * 86_400_000;
    if (due && !recentlyAsked) {
      const notBefore = context.backupSnoozedUntil && new Date(context.backupSnoozedUntil).getTime() > now.getTime()
        ? new Date(context.backupSnoozedUntil)
        : now;
      let fireAt = at(dateKey(notBefore), '18:00');
      if (fireAt.getTime() <= notBefore.getTime()) fireAt = at(addDays(dateKey(notBefore), 1), '18:00');
      plan.push({ key: 'backup', type: 'backup', channel: 'backup_sync', category: 'ordina_backup', fireAt, taskIds: [], vars: {}, open: 'backup' });
    }
  }

  // Quiet hours (everything except the user's own reminders) and past times.
  const timed = plan
    .map((item) => {
      if (isReminder(item.type) || !inQuietHours(item.fireAt, settings)) return item;
      // Planning messages lose their point after the night; others wait until quiet hours end.
      if (item.type === 'morning' || item.type === 'planPrompt' || item.type === 'evening') return null;
      return { ...item, fireAt: afterQuietHours(item.fireAt, settings) };
    })
    .filter((item): item is PlannedNotification => Boolean(item) && item!.fireAt.getTime() > now.getTime());

  return applyDailyCap(timed, context.sentToday ?? {}).sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

/** Reminders within a few minutes of each other become one notification. */
export function groupReminders(reminders: PlannedNotification[]): PlannedNotification[] {
  const sorted = [...reminders].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  const result: PlannedNotification[] = [];
  let bucket: PlannedNotification[] = [];
  const flush = () => {
    if (bucket.length === 1) result.push(bucket[0]);
    else if (bucket.length > 1) {
      result.push({
        key: `group_${bucket.map((item) => item.taskIds[0]).sort().join('_')}`,
        type: 'reminderGroup',
        channel: 'task_reminders',
        category: 'ordina_open',
        fireAt: bucket[0].fireAt,
        taskIds: bucket.flatMap((item) => item.taskIds),
        vars: { count: bucket.length, titles: bucket.map((item) => item.vars.title).join(', ') },
        open: 'today',
      });
    }
    bucket = [];
  };
  for (const item of sorted) {
    if (bucket.length && item.fireAt.getTime() - bucket[0].fireAt.getTime() > GROUP_WINDOW_MINUTES * 60_000) flush();
    bucket.push(item);
  }
  flush();
  return result;
}

/** At most DAILY_CAP non-reminder notifications per day, most useful first. */
export function applyDailyCap(plan: PlannedNotification[], sentToday: Record<string, number>): PlannedNotification[] {
  const used = new Map(Object.entries(sentToday));
  const others = plan
    .filter((item) => !isReminder(item.type))
    .sort((a, b) => (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9) || a.fireAt.getTime() - b.fireAt.getTime());
  const kept = new Set<PlannedNotification>();
  for (const item of others) {
    const day = dateKey(item.fireAt);
    const count = used.get(day) ?? 0;
    if (count >= DAILY_CAP) continue;
    used.set(day, count + 1);
    kept.add(item);
  }
  return plan.filter((item) => isReminder(item.type) || kept.has(item));
}

function timeAfter(start: string, minutes: number) {
  const total = (minutesOf(start) ?? 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The day "Tomorrow" / "Move to tomorrow" moves a task to (its time stays the same). */
export function tomorrowKey(now: Date) {
  return addDays(dateKey(now), 1);
}

// ---------------------------------------------------------------------------------------------
// Text

type T = (key: string, vars?: Record<string, string | number>) => string;

export type RenderOptions = {
  t: T;
  firstName?: string | null;
  formatTime: (time: string) => string;
  categoryName: (id: string) => string;
};

/** 2-3 wordings per message, picked from the key so a notification keeps its words when re-planned. */
export function variant(key: string, count: number) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % count) + 1;
}

/** Title and body in the app language. */
export function renderNotification(item: PlannedNotification, options: RenderOptions): { title: string; body: string } {
  const { t, formatTime } = options;
  const name = options.firstName?.trim().split(/\s+/)[0] ?? '';
  const withName = (key: string, vars: Record<string, string | number> = {}) => (name
    ? t(`${key}Named`, { ...vars, name })
    : t(key, vars));
  const v = item.vars;
  switch (item.type) {
    case 'reminder':
    case 'snooze': {
      const lead = Number(v.lead);
      const when = item.type === 'snooze' || lead === 0
        ? t('notif.reminder.now')
        : lead >= 1440 ? t('notif.reminder.tomorrow') : lead >= 60 ? t('notif.reminder.inHours', { n: Math.round(lead / 60) }) : t('notif.reminder.inMinutes', { n: lead });
      const time = v.start ? `${formatTime(String(v.start))}${v.end ? ` – ${formatTime(String(v.end))}` : ''}` : t('notif.reminder.anytime');
      const category = v.category ? ` · ${options.categoryName(String(v.category))}` : '';
      return {
        title: `${v.title} · ${when}`,
        body: `${time}${category}. ${withName(`notif.reminder.cheer${variant(item.key, 3)}`)}`,
      };
    }
    case 'reminderGroup':
      return { title: t('notif.group.title', { n: v.count }), body: String(v.titles) };
    case 'morning':
      return {
        title: withName(`notif.morning.title${variant(item.key, 2)}`),
        body: v.firstTime
          ? t(Number(v.count) === 1 ? 'notif.morning.bodyOneAt' : 'notif.morning.bodyAt', { n: v.count, first: v.first, time: formatTime(String(v.firstTime)) })
          : t(Number(v.count) === 1 ? 'notif.morning.bodyOne' : 'notif.morning.body', { n: v.count, first: v.first }),
      };
    case 'planPrompt':
      return { title: withName('notif.plan.title'), body: t('notif.plan.body') };
    case 'evening':
      return {
        title: t(Number(v.count) === 1 ? 'notif.evening.titleOne' : 'notif.evening.title', { n: v.count }),
        body: t(`notif.evening.body${variant(item.key, 3)}`),
      };
    case 'overdue':
      return {
        title: t('notif.overdue.title', { title: v.title }),
        body: `${t('notif.overdue.due', { time: formatTime(String(v.start)) })} ${t(`notif.overdue.body${variant(item.key, 2)}`)}`,
      };
    case 'weekly':
      return { title: t('notif.weekly.title', { n: v.count }), body: t('notif.weekly.body', { category: options.categoryName(String(v.category)) }) };
    case 'backup':
      return { title: t('notif.backup.title'), body: t('notif.backup.body') };
    default:
      return { title: 'ORDINA', body: '' };
  }
}
