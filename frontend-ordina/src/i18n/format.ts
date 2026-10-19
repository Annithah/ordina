/**
 * Dates, times and durations in the app's language, using the month and weekday names from the
 * translation files (the phone's Intl data may not include Kinyarwanda). No React Native
 * imports, so the unit tests run with plain Node.
 */
import { translateIn, type LocaleId } from './index.ts';

const list = (locale: LocaleId, key: string) => translateIn(locale, key).split(',').map((item) => item.trim());

function parts(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { date: new Date(y, m - 1, d), y, m, d };
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function monthName(locale: LocaleId, monthIndex: number, short = false) {
  return list(locale, short ? 'dates.monthsShort' : 'dates.months')[monthIndex] ?? '';
}

export function weekdayName(locale: LocaleId, weekday: number, style: 'long' | 'short' | 'narrow' = 'long') {
  const key = style === 'long' ? 'dates.weekdays' : style === 'short' ? 'dates.weekdaysShort' : 'dates.weekdaysNarrow';
  return list(locale, key)[weekday] ?? '';
}

/** "Monday 19 October" (with the year when it is not the current one). */
export function formatLongDate(locale: LocaleId, dateKey: string, now = new Date()) {
  const { date, y, m, d } = parts(dateKey);
  const text = translateIn(locale, 'dates.longDate', {
    weekday: weekdayName(locale, date.getDay()),
    day: d,
    month: monthName(locale, m - 1),
  });
  return y === now.getFullYear() ? text : `${text} ${y}`;
}

/** "Mon 19 Oct" (with the year when it is not the current one). */
export function formatShortDate(locale: LocaleId, dateKey: string, now = new Date()) {
  const { date, y, m, d } = parts(dateKey);
  const text = translateIn(locale, 'dates.shortDate', {
    weekday: weekdayName(locale, date.getDay(), 'short'),
    day: d,
    month: monthName(locale, m - 1, true),
  });
  return y === now.getFullYear() ? text : `${text} ${y}`;
}

/** "Today", "Tomorrow", "Yesterday", or the short date. */
export function formatDay(locale: LocaleId, dateKey: string, now = new Date()) {
  const today = keyOf(now);
  const tomorrow = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (dateKey === today) return translateIn(locale, 'dates.today');
  if (dateKey === tomorrow) return translateIn(locale, 'dates.tomorrow');
  if (dateKey === yesterday) return translateIn(locale, 'dates.yesterday');
  return formatShortDate(locale, dateKey, now);
}

/** "October 2026". */
export function formatMonthYear(locale: LocaleId, year: number, monthIndex: number) {
  return translateIn(locale, 'dates.monthYear', { month: monthName(locale, monthIndex), year });
}

/** English uses 12-hour time ("2:30 PM"); French and Kinyarwanda use 24-hour time ("14:30"). */
export function formatTime(locale: LocaleId, time: string | null | undefined) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return '';
  const hours = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  if (locale !== 'en') return `${pad(hours)}:${minutes}`;
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${minutes} ${suffix}`;
}

/** "15 min", "1 h", "1 h 30 min". */
export function formatDuration(locale: LocaleId, minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return translateIn(locale, 'dates.minutes', { n: m });
  if (!m) return translateIn(locale, 'dates.hours', { n: h });
  return translateIn(locale, 'dates.hoursMinutes', { h, m });
}

/** A moment like a backup time: "today 14:32", "yesterday 09:10", "Mon 12 Oct 18:00". */
export function formatMoment(locale: LocaleId, iso: string, now = new Date()) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const day = formatDay(locale, keyOf(when), now);
  const time = formatTime(locale, `${pad(when.getHours())}:${pad(when.getMinutes())}`);
  return translateIn(locale, 'dates.moment', { day: keyOf(when) === keyOf(now) || day === translateIn(locale, 'dates.yesterday') ? day.toLowerCase() : day, time });
}
