/**
 * Planning profile: how this user usually schedules each kind of task, learned on the phone.
 *
 * Built from the user's own recent tasks (weight 1 each) plus corrections they made to AI
 * suggestions in the plan preview (weight 3 each), so a couple of corrections outweigh older
 * habits. Only the compact summary (no task titles) is sent to Gemini.
 * Ported from backend-ordina/src/lib/planning-profile.js; keep the two in step.
 */

const TYPE_RULES: [string, RegExp][] = [
  ['call', /\b(call|phone|ring|facetime|video call)\b/],
  ['exercise', /\b(exercise|exercising|workout|work out|gym|run|running|jog|jogging|yoga|swim|swimming|training|fitness|cycling|pilates|stretch|stretching)\b/],
  ['study', /\b(study|studying|learn|learning|revise|revision|homework|course|lecture|exam|practice|practise|tutorial)\b/],
  ['meeting', /\b(meeting|meet|standup|stand-up|sync|interview|appointment|catch up|catch-up)\b/],
  ['errand', /\b(buy|shop|shopping|groceries|grocery|pick up|drop off|bank|post office|pharmacy|market)\b/],
  ['chores', /\b(clean|cleaning|laundry|dishes|tidy|vacuum|cook|cooking|ironing)\b/],
  ['meal', /\b(breakfast|lunch|dinner|meal)\b/],
  ['work', /\b(report|project|email|emails|presentation|slides|proposal|code|coding|deploy|draft|write|writing|invoice|client|work)\b/],
];
export const TASK_TYPES = [...TYPE_RULES.map(([type]) => type), 'other'];

export const CORRECTION_WEIGHT = 3;
export const MIN_HABIT_WEIGHT = 3;
export const MAX_CORRECTIONS = 40;
export const HISTORY_LIMIT = 150;

export type Priority = 'low' | 'medium' | 'high';
export type CorrectionField = 'startTime' | 'durationMinutes' | 'priority';
export type Correction = { type: string; field: CorrectionField; from: unknown; to: unknown; at: string };
export type HistoryTask = { title: string; description?: string | null; startTime?: string | null; duration?: string | null; priority?: string | number | null };
export type Habit = { samples: number; corrected: number; start?: string; durationMinutes?: number; priority?: Priority };
export type Profile = { v: 1; habits: Record<string, Habit>; workingHours: { start: string; end: string } | null; taskCount: number };

export function classifyTaskType(title?: string | null, description?: string | null, hint?: string) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(text)) return type;
  }
  return hint && TASK_TYPES.includes(hint) ? hint : 'other';
}

export function minutesFromTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function durationFromText(text?: string | null) {
  if (!text) return null;
  const hours = /(\d+)\s*h/.exec(text);
  const mins = /(\d+)\s*m/.exec(text);
  if (!hours && !mins) return null;
  return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0) || null;
}

function priorityName(value: unknown): Priority {
  if (value === 3 || value === 'high') return 'high';
  if (value === 2 || value === 'medium') return 'medium';
  return 'low';
}

type Sample = { value: number; weight: number };

export function weightedMedian(samples: Sample[]) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;
  for (const item of sorted) {
    running += item.weight;
    if (running >= total / 2) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

export function computeProfile(tasks: HistoryTask[], corrections: Correction[] = []): Profile {
  type Entry = { starts: Sample[]; durations: Sample[]; priorities: Record<Priority, number>; corrected: number; count: number };
  const byType: Record<string, Entry> = {};
  const bucket = (type: string) => {
    byType[type] = byType[type] || { starts: [], durations: [], priorities: { low: 0, medium: 0, high: 0 }, corrected: 0, count: 0 };
    return byType[type];
  };
  const allStarts: number[] = [];
  const allEnds: number[] = [];

  for (const task of tasks || []) {
    const entry = bucket(classifyTaskType(task.title, task.description));
    entry.count += 1;
    const start = minutesFromTime(task.startTime);
    const duration = durationFromText(task.duration);
    if (start !== null) {
      entry.starts.push({ value: start, weight: 1 });
      allStarts.push(start);
      allEnds.push(start + (duration || 60));
    }
    if (duration) entry.durations.push({ value: duration, weight: 1 });
    entry.priorities[priorityName(task.priority)] += 1;
  }

  for (const correction of corrections || []) {
    const entry = bucket(TASK_TYPES.includes(correction.type) ? correction.type : 'other');
    entry.corrected += 1;
    if (correction.field === 'startTime') {
      const start = minutesFromTime(correction.to);
      if (start !== null) entry.starts.push({ value: start, weight: CORRECTION_WEIGHT });
    } else if (correction.field === 'durationMinutes') {
      const minutes = Number(correction.to);
      if (Number.isFinite(minutes) && minutes > 0) entry.durations.push({ value: minutes, weight: CORRECTION_WEIGHT });
    } else if (correction.field === 'priority' && ['low', 'medium', 'high'].includes(correction.to as string)) {
      entry.priorities[correction.to as Priority] += CORRECTION_WEIGHT;
    }
  }

  const habits: Record<string, Habit> = {};
  for (const [type, entry] of Object.entries(byType)) {
    const startWeight = entry.starts.reduce((sum, item) => sum + item.weight, 0);
    const durationWeight = entry.durations.reduce((sum, item) => sum + item.weight, 0);
    const [topPriority, topCount] = (Object.entries(entry.priorities) as [Priority, number][]).sort((a, b) => b[1] - a[1])[0];
    const habit: Habit = { samples: entry.count, corrected: entry.corrected };
    if (startWeight >= MIN_HABIT_WEIGHT) habit.start = timeFromMinutes(weightedMedian(entry.starts)!);
    if (durationWeight >= MIN_HABIT_WEIGHT) habit.durationMinutes = weightedMedian(entry.durations)!;
    if (topCount >= MIN_HABIT_WEIGHT) habit.priority = topPriority;
    if (habit.start || habit.durationMinutes || habit.priority) habits[type] = habit;
  }

  const workingHours = allStarts.length >= 5
    ? { start: timeFromMinutes(percentile(allStarts, 0.1)), end: timeFromMinutes(Math.min(23 * 60 + 30, percentile(allEnds, 0.9))) }
    : null;

  return { v: 1, habits, workingHours, taskCount: (tasks || []).length };
}

export function habitFor(profile: Profile | null | undefined, type: string) {
  return profile?.habits?.[type] || null;
}

/** Compact, title-free summary of habits for the Gemini prompt. */
export function promptSummary(profile: Profile | null | undefined) {
  const habits = Object.entries(profile?.habits || {})
    .filter(([type]) => type !== 'other')
    .map(([type, habit]) => ({
      type,
      usualStart: habit.start || undefined,
      usualMinutes: habit.durationMinutes || undefined,
      usualPriority: habit.priority || undefined,
    }));
  return { habits, workingHours: profile?.workingHours || undefined };
}

type ConfirmedTask = {
  title: string;
  description?: string | null;
  type?: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  priority?: string | null;
  original?: { startTime?: string | null; durationMinutes?: number | null; priority?: string | null; sources?: Record<string, string> } | null;
};

/**
 * Compares what the AI proposed with what the user confirmed. A correction is recorded only for
 * values the AI suggested (not ones the user stated).
 */
export function correctionsFrom(confirmedTasks: ConfirmedTask[], now = new Date()): Correction[] {
  const corrections: Correction[] = [];
  for (const task of confirmedTasks || []) {
    const original = task.original;
    if (!original || typeof original !== 'object') continue;
    const sources = original.sources || {};
    const type = classifyTaskType(task.title, task.description, task.type);
    for (const field of ['startTime', 'durationMinutes', 'priority'] as const) {
      if (sources[field] === 'user') continue;
      const before = original[field] ?? null;
      const after = task[field] ?? null;
      if (after === null || before === after) continue;
      corrections.push({ type, field, from: before, to: after, at: now.toISOString() });
    }
  }
  return corrections;
}

export function mergeCorrections(existing: Correction[] | null | undefined, added: Correction[]) {
  return [...(Array.isArray(existing) ? existing : []), ...added].slice(-MAX_CORRECTIONS);
}
