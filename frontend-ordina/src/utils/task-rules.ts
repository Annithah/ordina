/**
 * Task rules for tasks stored on the phone (offline mode). Same rules and messages as the
 * server: backend-ordina/src/lib/task-validation.js. Keep the two files in step.
 */
import { isValidDateKey, isValidTime } from '@/utils/task-validation';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;

const PRIORITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['todo', 'pending', 'in_progress', 'completed']);
const CATEGORIES = new Set(['work', 'personal', 'health', 'learning', 'design', 'database']);

export type TaskRuleErrors = Partial<Record<
  'title' | 'description' | 'dueDate' | 'startTime' | 'duration' | 'priority' | 'status' | 'category' | 'deadline',
  string
>>;

export type ValidTaskFields = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  duration?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'pending' | 'in_progress' | 'completed';
  completed?: boolean;
  category?: string | null;
  deadline?: string | null;
};

/** Accepts "1h 30m", "45m", "2h" or a number of minutes. Returns minutes or null. */
export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

export function formatDurationValue(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function normalizePriority(value: unknown) {
  if (value === 3 || value === '3') return 'high';
  if (value === 2 || value === '2') return 'medium';
  if (value === 1 || value === '1' || value === 0 || value === '0') return 'low';
  return typeof value === 'string' ? value.toLowerCase() : value;
}

/**
 * Validates task input. With `partial: true` (updates) only the fields present are checked
 * and returned. Returns { value, errors } where errors maps field -> friendly message.
 */
export function validateTaskInput(body: Record<string, unknown>, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const errors: TaskRuleErrors = {};
  const value: ValidTaskFields = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

  if (!partial || has('title')) {
    const title = String(input.title ?? '').trim();
    if (!title) errors.title = 'Please add a task title.';
    else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
    else value.title = title;
  }

  if (has('description')) {
    const description = input.description === null ? '' : String(input.description).trim();
    if (description.length > DESCRIPTION_MAX) errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
    else value.description = description || null;
  }

  const dateKey = has('dueDate') ? input.dueDate : has('date') ? input.date : undefined;
  if (dateKey !== undefined) {
    if (dateKey === null || dateKey === '') value.dueDate = null;
    else if (typeof dateKey !== 'string' || !isValidDateKey(dateKey)) errors.dueDate = 'Please choose a valid date.';
    else value.dueDate = dateKey;
  }

  if (has('startTime')) {
    if (input.startTime === null || input.startTime === '') value.startTime = null;
    else if (typeof input.startTime !== 'string' || !isValidTime(input.startTime)) errors.startTime = 'Please choose a valid time (HH:MM).';
    else value.startTime = input.startTime;
  }

  const rawDuration = has('durationMinutes') ? input.durationMinutes : has('duration') ? input.duration : undefined;
  if (rawDuration !== undefined) {
    if (rawDuration === null || rawDuration === '') {
      value.duration = null;
    } else {
      const minutes = parseDurationMinutes(rawDuration);
      if (minutes === null || minutes < MIN_DURATION || minutes > MAX_DURATION) {
        errors.duration = `Duration must be between ${MIN_DURATION} minutes and 24 hours.`;
      } else {
        value.duration = formatDurationValue(minutes);
      }
    }
  }

  if (has('priority')) {
    const priority = normalizePriority(input.priority);
    if (typeof priority !== 'string' || !PRIORITIES.has(priority)) errors.priority = 'Priority must be low, medium or high.';
    else value.priority = priority as ValidTaskFields['priority'];
  }

  if (has('status')) {
    const status = String(input.status);
    if (!STATUSES.has(status)) errors.status = 'Unknown task status.';
    else value.status = (status === 'todo' ? 'pending' : status) as ValidTaskFields['status'];
  }

  if (has('completed')) value.completed = Boolean(input.completed);

  if (has('category')) {
    const category = String(input.category || '').toLowerCase();
    if (category && !CATEGORIES.has(category)) errors.category = 'Unknown category.';
    else value.category = category || null;
  }

  if (has('deadline')) {
    const deadline = input.deadline;
    if (deadline === null || deadline === '') {
      value.deadline = null;
    } else {
      const [date, time] = String(deadline).split('T');
      if (!isValidDateKey(date) || (time !== undefined && !isValidTime(time))) errors.deadline = 'Please choose a valid deadline.';
      else value.deadline = time ? `${date}T${time}` : date;
    }
  }

  return { value, errors };
}

export function firstRuleError(errors: TaskRuleErrors) {
  return Object.values(errors)[0] || 'Please check the task details.';
}
