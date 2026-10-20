import type { Task } from '@/store/tasks-store';
import { activeLocale, translate } from '@/i18n/translations';
import { addLocalDays, localDateKey } from '@/utils/dates';

export function minutesFromTime(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function durationToMinutes(text?: string) {
  if (!text) return 60;
  const hours = /(\d+)\s*h/.exec(text);
  const mins = /(\d+)\s*m/.exec(text);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  return total || 60;
}

export function minutesToDuration(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDuration(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime12(value?: string) {
  const minutes = minutesFromTime(value);
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function friendlyDay(dateKey: string) {
  const today = localDateKey();
  if (dateKey === today) return translate('task.today');
  if (dateKey === addLocalDays(today, 1)) return translate('task.tomorrow');
  if (dateKey === addLocalDays(today, -1)) return translate('task.yesterday');
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(activeLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Tasks on the day that overlap the given slot. */
export function findClashes(tasks: Task[], date: string, start: string | undefined, minutes: number, ignoreId?: string) {
  const from = minutesFromTime(start);
  if (from === null) return [];
  const to = from + minutes;
  return tasks.filter((task) => {
    if (task.id === ignoreId || task.completed || task.dueDate !== date) return false;
    const otherFrom = minutesFromTime(task.startTime);
    if (otherFrom === null) return false;
    return from < otherFrom + durationToMinutes(task.duration) && otherFrom < to;
  });
}

/** Earliest gap of `minutes` between 07:00 and 22:00 (never in the past for today). */
export function findFreeSlot(tasks: Task[], date: string, minutes: number, ignoreId?: string) {
  const busy = tasks
    .filter((task) => task.id !== ignoreId && !task.completed && task.dueDate === date && minutesFromTime(task.startTime) !== null)
    .map((task) => {
      const start = minutesFromTime(task.startTime)!;
      return { start, end: start + durationToMinutes(task.duration) };
    })
    .sort((a, b) => a.start - b.start);
  const now = new Date();
  let cursor = 7 * 60;
  if (date === localDateKey(now)) cursor = Math.max(cursor, Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15);
  while (cursor + minutes <= 22 * 60) {
    const hit = busy.find((block) => cursor < block.end && block.start < cursor + minutes);
    if (!hit) return timeFromMinutes(cursor);
    cursor = Math.ceil(hit.end / 15) * 15;
  }
  return null;
}

/** Total planned minutes on a day (open tasks only). */
export function plannedMinutes(tasks: Task[], date: string, ignoreId?: string) {
  return tasks
    .filter((task) => task.id !== ignoreId && !task.completed && task.dueDate === date)
    .reduce((sum, task) => sum + durationToMinutes(task.duration), 0);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type DetectedSchedule = { date?: string; time?: string; cleanTitle: string; label: string };

/** Picks up "tomorrow", "next friday", "at 7pm", "tonight" … from what the user types, without AI. */
export function detectSchedule(text: string): DetectedSchedule | null {
  let rest = ` ${text} `;
  const today = localDateKey();
  let date: string | undefined;
  let time: string | undefined;

  const take = (pattern: RegExp) => {
    const match = rest.match(pattern);
    if (match) rest = rest.replace(match[0], ' ');
    return match;
  };

  if (take(/\s(today)\s/i)) date = today;
  else if (take(/\s(tomorrow|tmrw|tmr)\s/i)) date = addLocalDays(today, 1);
  else if (take(/\s(tonight)\s/i)) {
    date = today;
    time = '20:00';
  } else {
    const weekday = take(/\s(?:on\s+)?(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s/i);
    if (weekday) {
      const target = WEEKDAYS.indexOf(weekday[2].toLowerCase());
      const current = new Date().getDay();
      let delta = (target - current + 7) % 7 || 7;
      if (weekday[1] && delta < 7) delta += 7;
      date = addLocalDays(today, delta);
    }
  }

  const clock = take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i) || take(/\sat\s+(\d{1,2})(?::(\d{2}))?\s/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    const period = clock[3]?.toLowerCase();
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    if (!period && hour < 7) hour += 12;
    if (hour < 24 && minute < 60) time = timeFromMinutes(hour * 60 + minute);
  } else if (!time) {
    if (take(/\s(?:this\s+|in the\s+)?morning\s/i)) time = '09:00';
    else if (take(/\s(?:this\s+|in the\s+)?afternoon\s/i)) time = '14:00';
    else if (take(/\s(?:this\s+|in the\s+)?evening\s/i)) time = '18:00';
  }

  if (!date && !time) return null;
  const cleanTitle = rest.replace(/\s+/g, ' ').trim().replace(/[,.;-]+$/, '').trim();
  const label = [date ? friendlyDay(date) : null, time ? formatTime12(time) : null].filter(Boolean).join(' · ');
  return { date, time, cleanTitle: cleanTitle || text.trim(), label };
}
