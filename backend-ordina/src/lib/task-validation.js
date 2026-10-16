/**
 * Server-side validation for task input. Used by the manual task routes and by
 * the AI plan confirmation so both paths store tasks in exactly the same shape.
 */

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;

const PRIORITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['todo', 'pending', 'in_progress', 'completed']);
const CATEGORIES = new Set(['work', 'personal', 'health', 'learning', 'design', 'database']);
const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly', 'custom']);

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Accepts "1h 30m", "45m", "2h" or a number of minutes. Returns minutes or null. */
function parseDurationMinutes(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function normalizePriority(value) {
  if (value === 3 || value === '3') return 'high';
  if (value === 2 || value === '2') return 'medium';
  if (value === 1 || value === '1' || value === 0 || value === '0') return 'low';
  return typeof value === 'string' ? value.toLowerCase() : value;
}

/**
 * Validates task input. With `partial: true` (updates) only the fields present
 * are checked and returned. Returns { value, errors } where errors maps field -> message.
 */
function validateTaskInput(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  const value = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

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
    else if (!isValidDateKey(dateKey)) errors.dueDate = 'Please choose a valid date.';
    else value.dueDate = dateKey;
  }

  if (has('startTime')) {
    if (input.startTime === null || input.startTime === '') value.startTime = null;
    else if (!isValidTime(input.startTime)) errors.startTime = 'Please choose a valid time (HH:MM).';
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
        value.duration = formatDuration(minutes);
      }
    }
  }

  if (has('priority')) {
    const priority = normalizePriority(input.priority);
    if (!PRIORITIES.has(priority)) errors.priority = 'Priority must be low, medium or high.';
    else value.priority = priority;
  }

  if (has('status')) {
    if (!STATUSES.has(input.status)) errors.status = 'Unknown task status.';
    else value.status = input.status === 'todo' ? 'pending' : input.status;
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

  if (has('recurrence')) {
    if (!RECURRENCES.has(input.recurrence)) errors.recurrence = 'Unknown repeat option.';
    else value.recurrence = input.recurrence;
  }

  return { value, errors };
}

function firstError(errors) {
  return Object.values(errors)[0] || 'Please check the task details.';
}

module.exports = {
  CATEGORIES,
  DESCRIPTION_MAX,
  TITLE_MAX,
  firstError,
  formatDuration,
  isValidDateKey,
  isValidTime,
  parseDurationMinutes,
  validateTaskInput,
};
