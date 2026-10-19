/**
 * Task time, duration and day-ordering rules. No app imports, so the unit tests run with plain
 * Node (`npm test`).
 *
 * - "Anytime" task: has a day (dueDate) but no start time. It is grouped apart from timed tasks
 *   and is only overdue once its day has ended.
 * - Duration is optional: a preset (15 min, 30 min, 1 h, 2 h), a custom value from 5 min to
 *   12 h, or none.
 */

export const DURATION_PRESETS = [15, 30, 60, 120] as const;
export const DURATION_MIN = 5;
export const DURATION_MAX = 12 * 60;

/** The fields these rules need; the app's Task type has all of them. */
export type TimedTask = {
  id: string;
  title: string;
  dueDate?: string | null;
  startTime?: string | null;
  /** "1h 30m", "45m" or null for no duration. */
  duration?: string | null;
  completed: boolean;
  status?: string;
  deadline?: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKeyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function minutesOf(time?: string | null): number | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function timeOf(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/** "1h 30m" / "45m" / "2h" / "90" -> minutes; null when empty or unreadable. */
export function durationMinutes(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) || null;
  const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const total = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return total > 0 ? total : null;
}

/** Minutes -> the stored form ("1h 30m"), or null for no duration. */
export function durationValue(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function isValidCustomDuration(minutes: number) {
  return Number.isInteger(minutes) && minutes >= DURATION_MIN && minutes <= DURATION_MAX;
}

export function isAnytime(task: Pick<TimedTask, 'startTime'>) {
  return minutesOf(task.startTime) === null;
}

/** Start and end in minutes of the day, or null for Anytime tasks. No duration counts as a moment. */
export function span(task: Pick<TimedTask, 'startTime' | 'duration'>): [number, number] | null {
  const start = minutesOf(task.startTime);
  if (start === null) return null;
  return [start, start + (durationMinutes(task.duration) ?? 0)];
}

function deadlinePassed(deadline: string | null | undefined, now: Date) {
  if (!deadline) return false;
  const [date, time] = deadline.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 59).getTime() < now.getTime();
}

/**
 * Overdue: not completed and its time is over.
 * - Anytime task: only after its day has ended.
 * - Timed task: after its end (start + duration), or after its start when it has no duration.
 *   A started (in progress) task is not overdue while its day lasts.
 * - A passed deadline always makes it overdue.
 */
export function isOverdue(task: TimedTask, now = new Date()) {
  if (task.completed) return false;
  if (deadlinePassed(task.deadline, now)) return true;
  if (!task.dueDate) return false;
  const today = dateKeyOf(now);
  if (task.dueDate < today) return true;
  if (task.dueDate > today) return false;
  const times = span(task);
  if (!times || task.status === 'in_progress') return false;
  return times[1] < now.getHours() * 60 + now.getMinutes();
}

/** Timed tasks by start time, then shorter first, then title. */
export function compareByTime(a: TimedTask, b: TimedTask) {
  const am = minutesOf(a.startTime);
  const bm = minutesOf(b.startTime);
  if (am !== null && bm !== null && am !== bm) return am - bm;
  if (am === null && bm !== null) return 1;
  if (am !== null && bm === null) return -1;
  return a.title.localeCompare(b.title);
}

export type DayGroup<T extends TimedTask> = {
  /** YYYY-MM-DD, or null for tasks without a day. */
  date: string | null;
  /** Tasks with a start time, in time order. */
  timed: T[];
  /** Tasks with a day but no time. */
  anytime: T[];
};

/** Groups tasks by day (earliest day first, undated last); timed in time order, Anytime apart. */
export function groupByDay<T extends TimedTask>(tasks: T[]): DayGroup<T>[] {
  const byDate = new Map<string | null, DayGroup<T>>();
  for (const task of tasks) {
    const date = task.dueDate || null;
    let group = byDate.get(date);
    if (!group) {
      group = { date, timed: [], anytime: [] };
      byDate.set(date, group);
    }
    (isAnytime(task) ? group.anytime : group.timed).push(task);
  }
  const groups = [...byDate.values()];
  for (const group of groups) {
    group.timed.sort(compareByTime);
    group.anytime.sort((a, b) => Number(a.completed) - Number(b.completed) || a.title.localeCompare(b.title));
  }
  return groups.sort((a, b) => (a.date === null ? 1 : b.date === null ? -1 : a.date.localeCompare(b.date)));
}

/** Other timed tasks on the same day whose time overlaps [start, start + duration). */
export function findOverlaps<T extends TimedTask>(
  tasks: T[],
  candidate: { id?: string; dueDate?: string | null; startTime?: string | null; duration?: string | null },
): T[] {
  const own = span(candidate);
  if (!own || !candidate.dueDate) return [];
  // A task without a duration still occupies its starting minute.
  const [start, end] = own[1] > own[0] ? own : [own[0], own[0] + 1];
  return tasks.filter((task) => {
    if (task.id === candidate.id || task.completed || task.dueDate !== candidate.dueDate) return false;
    const theirs = span(task);
    if (!theirs) return false;
    const [s, e] = theirs[1] > theirs[0] ? theirs : [theirs[0], theirs[0] + 1];
    return start < e && s < end;
  });
}
