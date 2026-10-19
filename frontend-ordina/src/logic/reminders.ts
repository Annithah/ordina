/**
 * When a task's reminder fires. No app imports, so the unit tests run with plain Node.
 *
 * Stored on the task as `reminder` (one of REMINDER_OPTIONS) and, for "custom", `reminderAt`
 * as a local "YYYY-MM-DDTHH:MM". Anytime tasks have no start time, so they only offer "none"
 * or "custom" (a time the user picks, on the task's day by default).
 */
import { minutesOf } from './schedule.ts';

export const REMINDER_OPTIONS = ['none', 'start', '5', '15', '30', '60', '1440', 'custom'] as const;
export type ReminderOption = (typeof REMINDER_OPTIONS)[number];

/** Options offered for a timed task, and for an Anytime task. */
export const TIMED_REMINDER_OPTIONS: ReminderOption[] = ['none', 'start', '5', '15', '30', '60', '1440', 'custom'];
export const ANYTIME_REMINDER_OPTIONS: ReminderOption[] = ['none', 'custom'];

export type RemindableTask = {
  dueDate?: string | null;
  startTime?: string | null;
  completed: boolean;
  reminder?: string | null;
  reminderAt?: string | null;
};

export function isReminderOption(value: unknown): value is ReminderOption {
  return typeof value === 'string' && (REMINDER_OPTIONS as readonly string[]).includes(value);
}

export function localDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Minutes before the start time for an offset option; 0 for "start". */
function leadMinutes(option: ReminderOption) {
  if (option === 'start') return 0;
  const minutes = Number(option);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * The moment the reminder should fire, or null when there is none to schedule: no reminder,
 * a completed task, missing date/time, or a moment already in the past.
 */
export function reminderTime(task: RemindableTask, now = new Date()): Date | null {
  const option = isReminderOption(task.reminder) ? task.reminder : 'none';
  if (option === 'none' || task.completed) return null;
  let when: Date | null = null;
  if (option === 'custom') {
    when = task.reminderAt ? localDateTime(task.reminderAt) : null;
  } else {
    const start = minutesOf(task.startTime);
    const lead = leadMinutes(option);
    if (!task.dueDate || start === null || lead === null) return null;
    const startAt = localDateTime(`${task.dueDate}T${task.startTime}`);
    when = startAt ? new Date(startAt.getTime() - lead * 60_000) : null;
  }
  if (!when || when.getTime() <= now.getTime()) return null;
  return when;
}

/** Keeps a reminder that makes sense after an edit (e.g. the task became Anytime). */
export function normalizeReminder(task: RemindableTask): { reminder: ReminderOption; reminderAt: string | null } {
  const option = isReminderOption(task.reminder) ? task.reminder : 'none';
  if (option === 'custom') {
    return task.reminderAt && localDateTime(task.reminderAt) ? { reminder: 'custom', reminderAt: task.reminderAt } : { reminder: 'none', reminderAt: null };
  }
  if (option !== 'none' && minutesOf(task.startTime) === null) return { reminder: 'none', reminderAt: null };
  return { reminder: option, reminderAt: null };
}
