/**
 * Per-user planning profile: how this user usually schedules each kind of task.
 *
 * Built from the user's own recent tasks (weight 1 each) plus corrections they
 * made to AI suggestions in the plan preview (weight 3 each), so a couple of
 * corrections outweigh older habits. Only ever used for the same user, and only
 * the compact summary (no task titles) is sent to Gemini.
 */

const TYPE_RULES = [
  ['call', /\b(call|phone|ring|facetime|video call)\b/],
  ['exercise', /\b(exercise|exercising|workout|work out|gym|run|running|jog|jogging|yoga|swim|swimming|training|fitness|cycling|pilates|stretch|stretching)\b/],
  ['study', /\b(study|studying|learn|learning|revise|revision|homework|course|lecture|exam|practice|practise|tutorial)\b/],
  ['meeting', /\b(meeting|meet|standup|stand-up|sync|interview|appointment|catch up|catch-up)\b/],
  ['errand', /\b(buy|shop|shopping|groceries|grocery|pick up|drop off|bank|post office|pharmacy|market)\b/],
  ['chores', /\b(clean|cleaning|laundry|dishes|tidy|vacuum|cook|cooking|ironing)\b/],
  ['meal', /\b(breakfast|lunch|dinner|meal)\b/],
  ['work', /\b(report|project|email|emails|presentation|slides|proposal|code|coding|deploy|draft|write|writing|invoice|client|work)\b/],
];
const TASK_TYPES = [...TYPE_RULES.map(([type]) => type), 'other'];

const CORRECTION_WEIGHT = 3;
const MIN_HABIT_WEIGHT = 3;
const MAX_CORRECTIONS = 40;
const HISTORY_DAYS = 90;
const HISTORY_LIMIT = 150;

function classifyTaskType(title, description, hint) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(text)) return type;
  }
  return TASK_TYPES.includes(hint) ? hint : 'other';
}

function minutesFromTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function timeFromMinutes(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function durationFromText(text) {
  if (!text) return null;
  const hours = /(\d+)\s*h/.exec(text);
  const mins = /(\d+)\s*m/.exec(text);
  if (!hours && !mins) return null;
  return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0) || null;
}

function priorityName(value) {
  if (value === 3 || value === 'high') return 'high';
  if (value === 2 || value === 'medium') return 'medium';
  return 'low';
}

function weightedMedian(samples) {
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

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

/**
 * @param tasks rows from the tasks table (title, description, startTime, duration, priority)
 * @param corrections [{ type, field: 'startTime'|'durationMinutes'|'priority', to }]
 */
function computeProfile(tasks, corrections = []) {
  const byType = {};
  const bucket = (type) => {
    byType[type] = byType[type] || { starts: [], durations: [], priorities: { low: 0, medium: 0, high: 0 }, corrected: 0, count: 0 };
    return byType[type];
  };
  const allStarts = [];
  const allEnds = [];

  for (const task of tasks || []) {
    const type = classifyTaskType(task.title, task.description);
    const entry = bucket(type);
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
    } else if (correction.field === 'priority' && ['low', 'medium', 'high'].includes(correction.to)) {
      entry.priorities[correction.to] += CORRECTION_WEIGHT;
    }
  }

  const habits = {};
  for (const [type, entry] of Object.entries(byType)) {
    const startWeight = entry.starts.reduce((sum, item) => sum + item.weight, 0);
    const durationWeight = entry.durations.reduce((sum, item) => sum + item.weight, 0);
    const [topPriority, topCount] = Object.entries(entry.priorities).sort((a, b) => b[1] - a[1])[0];
    const habit = { samples: entry.count, corrected: entry.corrected };
    if (startWeight >= MIN_HABIT_WEIGHT) habit.start = timeFromMinutes(weightedMedian(entry.starts));
    if (durationWeight >= MIN_HABIT_WEIGHT) habit.durationMinutes = weightedMedian(entry.durations);
    if (topCount >= MIN_HABIT_WEIGHT) habit.priority = topPriority;
    if (habit.start || habit.durationMinutes || habit.priority) habits[type] = habit;
  }

  const workingHours = allStarts.length >= 5
    ? { start: timeFromMinutes(percentile(allStarts, 0.1)), end: timeFromMinutes(Math.min(23 * 60 + 30, percentile(allEnds, 0.9))) }
    : null;

  return { v: 1, habits, workingHours, taskCount: (tasks || []).length };
}

function habitFor(profile, type) {
  return profile?.habits?.[type] || null;
}

/** Compact, title-free summary of habits for the Gemini prompt. */
function promptSummary(profile) {
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

/**
 * Compares what the AI proposed with what the user confirmed. A correction is
 * recorded only for values the AI suggested (not ones the user stated).
 */
function correctionsFrom(confirmedTasks, now = new Date()) {
  const corrections = [];
  for (const task of confirmedTasks || []) {
    const original = task.original;
    if (!original || typeof original !== 'object') continue;
    const sources = original.sources || {};
    const type = classifyTaskType(task.title, task.description, task.type);
    for (const field of ['startTime', 'durationMinutes', 'priority']) {
      if (sources[field] === 'user') continue;
      const before = original[field] ?? null;
      const after = task[field] ?? null;
      if (after === null || before === after) continue;
      corrections.push({ type, field, from: before, to: after, at: now.toISOString() });
    }
  }
  return corrections;
}

function mergeCorrections(existing, added) {
  return [...(Array.isArray(existing) ? existing : []), ...added].slice(-MAX_CORRECTIONS);
}

module.exports = {
  CORRECTION_WEIGHT,
  HISTORY_DAYS,
  HISTORY_LIMIT,
  MIN_HABIT_WEIGHT,
  TASK_TYPES,
  classifyTaskType,
  computeProfile,
  correctionsFrom,
  habitFor,
  mergeCorrections,
  minutesFromTime,
  promptSummary,
  timeFromMinutes,
  weightedMedian,
};
