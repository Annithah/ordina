/** Client-side task checks (same limits as utils/task-rules.ts), with translated messages. */
import { translate } from '@/i18n';
import { DURATION_MAX, DURATION_MIN } from '@/logic/schedule';

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
  durationMinutes?: number | null;
}): TaskFieldErrors {
  const errors: TaskFieldErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = translate('errors.titleRequired');
  else if (title.length > TITLE_MAX) errors.title = translate('errors.titleTooLong', { max: TITLE_MAX });
  if ((input.description ?? '').trim().length > DESCRIPTION_MAX) {
    errors.description = translate('errors.descriptionTooLong', { max: DESCRIPTION_MAX });
  }
  if (input.dueDate && !isValidDateKey(input.dueDate)) errors.dueDate = translate('errors.invalidDate');
  if (input.startTime && !isValidTime(input.startTime)) errors.startTime = translate('errors.invalidTime');
  if (input.durationMinutes != null && (input.durationMinutes < DURATION_MIN || input.durationMinutes > DURATION_MAX)) {
    errors.duration = translate('errors.invalidDuration');
  }
  return errors;
}

/**
 * Turns an error into a short, friendly sentence in the app's language (never a raw stack or
 * status code). Server messages are shown only when the server sent a translated `code`
 * this app knows; otherwise the translated fallback is used.
 */
export function friendlyError(error: unknown, fallback: string) {
  const err = error as { response?: { status?: number; data?: { message?: string; code?: string } }; code?: string; message?: string };
  if (err?.response?.status === 401) return translate('errors.sessionExpired');
  const code = err?.response?.data?.code;
  if (code) {
    const known = translate(`serverErrors.${code}`);
    if (known !== `serverErrors.${code}`) return known;
  }
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) return translate('errors.timeout');
  if (/Network Error/i.test(err?.message ?? '') || (err && !err.response && err.message && /network|fetch/i.test(err.message))) return translate('errors.network');
  return fallback;
}
