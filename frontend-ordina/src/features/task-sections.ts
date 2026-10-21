/**
 * The Tasks page list: every task in one of Overdue, Today, Tomorrow, Upcoming, No date and
 * Completed, ready for a SectionList. Pure so it can be unit tested.
 */

export type SectionTask = {
  id: string;
  title: string;
  dueDate?: string;
  startTime?: string;
  completed: boolean;
  updatedAt?: string;
};

export type SectionId = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'noDate' | 'completed';

export const SECTION_ORDER: SectionId[] = ['overdue', 'today', 'tomorrow', 'upcoming', 'noDate', 'completed'];

/** One list row: a task, or a small heading inside a section (a date, or Anytime / Scheduled). */
export type SectionRow<T> =
  | { kind: 'task'; key: string; task: T }
  | { kind: 'day'; key: string; date: string }
  | { kind: 'anytime' | 'scheduled' | 'noDate'; key: string };

export type TaskSection<T> = { id: SectionId; count: number; data: SectionRow<T>[] };

function addDays(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function minutes(time?: string) {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function byTime(a: SectionTask, b: SectionTask) {
  const am = minutes(a.startTime);
  const bm = minutes(b.startTime);
  if (am === null && bm === null) return a.title.localeCompare(b.title);
  if (am === null) return -1;
  if (bm === null) return 1;
  return am - bm;
}

function byDateThenTime(a: SectionTask, b: SectionTask) {
  return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || byTime(a, b);
}

/** Which section a task belongs to. `isOverdue` decides when a pending task's time has passed. */
export function sectionOf(task: SectionTask, today: string, isOverdue: (task: SectionTask) => boolean): SectionId {
  if (task.completed) return 'completed';
  if (isOverdue(task) || (task.dueDate && task.dueDate < today)) return 'overdue';
  if (!task.dueDate) return 'noDate';
  if (task.dueDate === today) return 'today';
  if (task.dueDate === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

/**
 * Every task, in sections. Today lists Anytime tasks first, then timed ones in order; Overdue,
 * Upcoming and Completed show a date heading above each new day. Empty sections are left out.
 */
export function buildTaskSections<T extends SectionTask>(
  tasks: T[],
  options: { today: string; isOverdue: (task: T) => boolean },
): TaskSection<T>[] {
  const buckets = new Map<SectionId, T[]>(SECTION_ORDER.map((id) => [id, []]));
  for (const task of tasks) buckets.get(sectionOf(task, options.today, options.isOverdue as (task: SectionTask) => boolean))!.push(task);

  return SECTION_ORDER.flatMap((id) => {
    const items = buckets.get(id)!;
    if (!items.length) return [];
    const data: SectionRow<T>[] = [];
    const row = (task: T): SectionRow<T> => ({ kind: 'task', key: task.id, task });
    if (id === 'today' || id === 'tomorrow') {
      items.sort(byTime);
      const anytime = items.filter((task) => minutes(task.startTime) === null);
      const timed = items.filter((task) => minutes(task.startTime) !== null);
      if (anytime.length && timed.length) {
        data.push({ kind: 'anytime', key: `${id}-anytime` }, ...anytime.map(row), { kind: 'scheduled', key: `${id}-scheduled` }, ...timed.map(row));
      } else {
        data.push(...items.map(row));
      }
    } else if (id === 'noDate') {
      items.sort((a, b) => a.title.localeCompare(b.title));
      data.push(...items.map(row));
    } else {
      // Completed: most recent first. Overdue and Upcoming: soonest first.
      items.sort(id === 'completed' ? (a, b) => byDateThenTime(b, a) : byDateThenTime);
      let lastDate: string | undefined | null = null;
      for (const task of items) {
        if (task.dueDate !== lastDate && task.dueDate) data.push({ kind: 'day', key: `${id}-${task.dueDate}`, date: task.dueDate });
        lastDate = task.dueDate;
        data.push(row(task));
      }
    }
    return [{ id, count: items.length, data }];
  });
}

/** Number of open tasks per day, for the dots on the calendar strip. */
export function openTasksByDay(tasks: SectionTask[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.dueDate && !task.completed) counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1);
  }
  return counts;
}

/**
 * Tasks already in the order to show (e.g. a dashboard filter), with a date heading above each
 * new day ("Mon, 20 Oct") and one "No date" heading for undated tasks.
 */
export function dateGroupedRows<T extends SectionTask>(tasks: T[]): SectionRow<T>[] {
  const rows: SectionRow<T>[] = [];
  let last: string | null | undefined;
  for (const task of tasks) {
    const date = task.dueDate ?? null;
    if (date !== last) rows.push(date ? { kind: 'day', key: `day-${date}`, date } : { kind: 'noDate', key: 'no-date' });
    last = date;
    rows.push({ kind: 'task', key: task.id, task });
  }
  return rows;
}
