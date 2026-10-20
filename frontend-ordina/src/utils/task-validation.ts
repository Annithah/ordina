/** Client-side checks that mirror backend-ordina/src/lib/task-validation.js. */

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

export type TaskFieldErrors = Partial<Record<'title' | 'description' | 'dueDate' | 'startTime' | 'duration', string>>;

export function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateTaskForm(input: {
  title: string;
  description?: string;
  dueDate?: string;
  startTime?: string;
  durationMinutes?: number;
}): TaskFieldErrors {
  const errors: TaskFieldErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = 'Please add a task title.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if ((input.description ?? '').trim().length > DESCRIPTION_MAX) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
  }
  if (input.dueDate && !isValidDateKey(input.dueDate)) errors.dueDate = 'Please choose a valid date.';
  if (input.startTime && !isValidTime(input.startTime)) errors.startTime = 'Please choose a valid time.';
  if (input.durationMinutes !== undefined && (input.durationMinutes < 5 || input.durationMinutes > 24 * 60)) {
    errors.duration = 'Duration must be between 5 minutes and 24 hours.';
  }
  return errors;
}

/** Turns an axios error into a short, friendly sentence (never a raw stack or status code). */
export function friendlyError(error: unknown, fallback: string) {
  const err = error as { response?: { status?: number; data?: { message?: string } }; code?: string; message?: string };
  if (err?.response?.status === 401) return 'Your session has expired. Please sign in again.';
  const serverMessage = err?.response?.data?.message;
  if (serverMessage && err.response?.status && err.response.status < 500) return serverMessage;
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) return 'The server took too long to answer. Please try again.';
  if (/Network Error/i.test(err?.message ?? '')) return 'Cannot reach the ORDINA server. Check your connection and try again.';
  return serverMessage || fallback;
}
