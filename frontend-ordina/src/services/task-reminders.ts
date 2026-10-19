/**
 * Keeps each task's local notification in step with the task: saving schedules or moves it,
 * completing or deleting cancels it, and the Settings switch turns them all on or off.
 * Notification id: "task-<task id>"; its data carries the task id so a tap opens the task.
 */
import { currentLocaleId, translate } from '@/i18n';
import { formatDay, formatTime } from '@/i18n/format';
import { reminderTime } from '@/logic/reminders';
import { cancelScheduled, scheduleAt, scheduledIds } from '@/services/notifications';
import { getSettings } from '@/store/settings-store';
import type { Task } from '@/store/tasks-store';

const PREFIX = 'task-';
/** Android limits scheduled alarms per app; the soonest ones are enough. */
const MAX_SCHEDULED = 60;

function body(task: Task) {
  const locale = currentLocaleId();
  const day = task.dueDate ? formatDay(locale, task.dueDate) : '';
  if (task.startTime) return translate('reminders.notificationBody', { day, time: formatTime(locale, task.startTime) });
  return day ? translate('reminders.notificationAnytime', { day: day.toLowerCase() }) : task.title;
}

export async function syncReminderFor(task: Task) {
  const when = getSettings().remindersEnabled ? reminderTime(task) : null;
  if (!when) {
    await cancelScheduled(PREFIX + task.id);
    return false;
  }
  return scheduleAt(PREFIX + task.id, when, {
    title: task.title,
    body: body(task),
    data: { type: 'task', taskId: task.id },
  });
}

export async function cancelReminderFor(taskId: string) {
  await cancelScheduled(PREFIX + taskId);
}

/**
 * Reschedules every task reminder from scratch: on app start, after a restore or sync, and when
 * reminders are switched on or off. Only the next MAX_SCHEDULED reminders are kept scheduled.
 */
export async function rescheduleAll(tasks: Task[]) {
  const existing = await scheduledIds(PREFIX);
  const enabled = getSettings().remindersEnabled;
  const upcoming = enabled
    ? tasks
      .map((task) => ({ task, when: reminderTime(task) }))
      .filter((item): item is { task: Task; when: Date } => item.when !== null)
      .sort((a, b) => a.when.getTime() - b.when.getTime())
      .slice(0, MAX_SCHEDULED)
    : [];
  const keep = new Set(upcoming.map((item) => PREFIX + item.task.id));
  await Promise.all(existing.filter((id) => !keep.has(id)).map((id) => cancelScheduled(id)));
  for (const { task, when } of upcoming) {
    await scheduleAt(PREFIX + task.id, when, { title: task.title, body: body(task), data: { type: 'task', taskId: task.id } }).catch(() => false);
  }
}
