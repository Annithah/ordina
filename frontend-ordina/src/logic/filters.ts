/**
 * Home page search and filters. No app imports, so the unit tests run with plain Node.
 *
 * Filtering happens in SQLite (`filterSql`) so it stays fast with thousands of tasks. Overdue
 * depends on the time of day and the task's duration, so SQL narrows the rows and
 * `matchesStatus` gives the exact answer with the same rule as everywhere else.
 */
import { dateKeyOf, isOverdue, type TimedTask } from './schedule.ts';

export type StatusFilter = 'all' | 'pending' | 'completed' | 'overdue';
export type DateFilter = 'today' | 'tomorrow' | 'week' | 'upcoming' | 'custom';
export type PriorityFilter = 'low' | 'medium' | 'high';
export type WeekStart = 'monday' | 'sunday';

export type TaskFilters = {
  search: string;
  categoryIds: string[];
  status: StatusFilter;
  /** null: any day. */
  date: DateFilter | null;
  /** YYYY-MM-DD, used when date is "custom". */
  from: string | null;
  to: string | null;
  priorities: PriorityFilter[];
};

export const EMPTY_FILTERS: TaskFilters = {
  search: '',
  categoryIds: [],
  status: 'all',
  date: null,
  from: null,
  to: null,
  priorities: [],
};

/** What the home page shows on first launch. */
export const DEFAULT_FILTERS: TaskFilters = { ...EMPTY_FILTERS, date: 'today' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKeyOf(new Date(y, m - 1, d + days));
}

/** First and last day of the week containing `today`. */
export function weekRange(today: string, weekStart: WeekStart = 'monday'): [string, string] {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const offset = weekStart === 'monday' ? (weekday + 6) % 7 : weekday;
  const first = addDays(today, -offset);
  return [first, addDays(first, 6)];
}

/** The date range a date filter covers: [from, to], where null means open-ended. */
export function dateRange(filters: Pick<TaskFilters, 'date' | 'from' | 'to'>, now = new Date(), weekStart: WeekStart = 'monday'): [string | null, string | null] | null {
  const today = dateKeyOf(now);
  switch (filters.date) {
    case 'today':
      return [today, today];
    case 'tomorrow': {
      const tomorrow = addDays(today, 1);
      return [tomorrow, tomorrow];
    }
    case 'week':
      return weekRange(today, weekStart);
    case 'upcoming':
      return [today, null];
    case 'custom': {
      const from = filters.from && DATE_RE.test(filters.from) ? filters.from : null;
      const to = filters.to && DATE_RE.test(filters.to) ? filters.to : null;
      if (from && to && from > to) return [to, from];
      return [from, to];
    }
    default:
      return null;
  }
}

/** Escapes % _ and \ for a LIKE pattern with ESCAPE '\'. */
export function likePattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * SQL WHERE clause (without "WHERE") and its parameters for the `tasks` table. Deleted tasks
 * (soft deleted for sync) are always excluded.
 */
export function filterSql(filters: TaskFilters, now = new Date(), weekStart: WeekStart = 'monday') {
  const where: string[] = ['deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const today = dateKeyOf(now);

  const search = filters.search.trim();
  if (search) {
    where.push("(title LIKE ? ESCAPE '\\' OR IFNULL(description, '') LIKE ? ESCAPE '\\')");
    params.push(likePattern(search), likePattern(search));
  }
  if (filters.categoryIds.length) {
    where.push(`category_id IN (${filters.categoryIds.map(() => '?').join(', ')})`);
    params.push(...filters.categoryIds);
  }
  if (filters.priorities.length) {
    where.push(`priority IN (${filters.priorities.map(() => '?').join(', ')})`);
    params.push(...filters.priorities);
  }
  const range = dateRange(filters, now, weekStart);
  if (range) {
    if (range[0]) {
      where.push('due_date >= ?');
      params.push(range[0]);
    }
    if (range[1]) {
      where.push('due_date <= ?');
      params.push(range[1]);
    }
  }
  if (filters.status === 'completed') {
    where.push("status = 'completed'");
  } else if (filters.status === 'pending') {
    where.push("status != 'completed'");
  } else if (filters.status === 'overdue') {
    // Candidates only: due today or earlier, or a deadline today or earlier. matchesStatus decides.
    where.push("status != 'completed' AND ((due_date IS NOT NULL AND due_date <= ?) OR (deadline IS NOT NULL AND substr(deadline, 1, 10) <= ?))");
    params.push(today, today);
  }
  return { where: where.join(' AND '), params };
}

/** Exact status check for one task (pending = not completed and not overdue). */
export function matchesStatus(task: TimedTask, status: StatusFilter, now = new Date()) {
  switch (status) {
    case 'completed':
      return task.completed;
    case 'overdue':
      return isOverdue(task, now);
    case 'pending':
      return !task.completed && !isOverdue(task, now);
    default:
      return true;
  }
}

export type FilterChip =
  | { kind: 'search'; value: string }
  | { kind: 'category'; value: string }
  | { kind: 'status'; value: StatusFilter }
  | { kind: 'date'; value: DateFilter; from: string | null; to: string | null }
  | { kind: 'priority'; value: PriorityFilter };

/** The active filters, one removable chip each. */
export function activeChips(filters: TaskFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.search.trim()) chips.push({ kind: 'search', value: filters.search.trim() });
  for (const id of filters.categoryIds) chips.push({ kind: 'category', value: id });
  if (filters.status !== 'all') chips.push({ kind: 'status', value: filters.status });
  if (filters.date) chips.push({ kind: 'date', value: filters.date, from: filters.from, to: filters.to });
  for (const priority of filters.priorities) chips.push({ kind: 'priority', value: priority });
  return chips;
}

export function removeChip(filters: TaskFilters, chip: FilterChip): TaskFilters {
  switch (chip.kind) {
    case 'search':
      return { ...filters, search: '' };
    case 'category':
      return { ...filters, categoryIds: filters.categoryIds.filter((id) => id !== chip.value) };
    case 'status':
      return { ...filters, status: 'all' };
    case 'date':
      return { ...filters, date: null, from: null, to: null };
    case 'priority':
      return { ...filters, priorities: filters.priorities.filter((p) => p !== chip.value) };
  }
}

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const STATUSES: StatusFilter[] = ['all', 'pending', 'completed', 'overdue'];
const DATES: DateFilter[] = ['today', 'tomorrow', 'week', 'upcoming', 'custom'];
const PRIORITIES: PriorityFilter[] = ['low', 'medium', 'high'];

/** Reads saved filters, dropping anything invalid (e.g. a category that was deleted). */
export function sanitizeFilters(value: unknown, categoryIds?: string[]): TaskFilters {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : []);
  const date = DATES.includes(raw.date as DateFilter) ? (raw.date as DateFilter) : null;
  const day = (v: unknown) => (typeof v === 'string' && DATE_RE.test(v) ? v : null);
  return {
    search: typeof raw.search === 'string' ? raw.search.slice(0, 200) : '',
    categoryIds: [...new Set(list(raw.categoryIds))].filter((id) => !categoryIds || categoryIds.includes(id)),
    status: STATUSES.includes(raw.status as StatusFilter) ? (raw.status as StatusFilter) : 'all',
    date,
    from: date === 'custom' ? day(raw.from) : null,
    to: date === 'custom' ? day(raw.to) : null,
    priorities: [...new Set(list(raw.priorities))].filter((p): p is PriorityFilter => PRIORITIES.includes(p as PriorityFilter)),
  };
}
