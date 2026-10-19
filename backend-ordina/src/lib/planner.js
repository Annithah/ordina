/**
 * ORDINA AI planner: plain-language request -> validated, non-overlapping task plan.
 *
 * Flow: build prompt (date, time, timezone, busy blocks, learned habits) -> Gemini
 * structured JSON -> validatePlan -> apply learned habits to values the user did
 * not state -> place tasks in free slots -> return for review. Nothing is saved here.
 */

const { randomUUID } = require('node:crypto');

const { geminiJson } = require('./gemini');
const { PLAN_RESPONSE_SCHEMA, validatePlan } = require('./plan-schema');
const { habitFor, minutesFromTime, promptSummary, timeFromMinutes } = require('./planning-profile');
const { isValidDateKey, isValidTime } = require('./task-validation');

const PLAN_DEADLINE_MS = 45_000;
const STEP = 15;
const DEFAULT_DAY = [7 * 60, 21 * 60 + 30];
const WINDOW_BOUNDS = {
  morning: [6 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 21 * 60 + 30],
  night: [19 * 60 + 30, 23 * 60 + 30],
};
const DEFAULT_DURATION = { call: 15, meeting: 60, study: 60, work: 60, exercise: 30, errand: 30, chores: 30, meal: 30, other: 30 };
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const SYSTEM_PROMPT = `You are ORDINA, a calm, practical daily planner.
Turn the user's request into a task plan. Return JSON that matches the response schema exactly.

Dates and times
- "today" is given in the context, with the user's local time and timezone. Resolve "tomorrow", weekdays, "tonight" etc. from it.
- A day word applies only to the activity it belongs to. An activity with no day of its own is for today, unless it can no longer fit today; then use tomorrow and say so in assumptions.
- Never schedule anything earlier than the current local time on today.
- Use 24-hour HH:MM.

One task per activity
- Create a separate task for every distinct activity. Keep titles short and actionable ("Study Python", "Call mentor").
- type: call, exercise, study, meeting, errand, chores, meal, work, or other.

Where each value came from (sources)
- "user" only if the user explicitly stated that value: an exact clock time ("at 6 PM"), an explicit length ("for two hours", "30 minutes"), an explicit date or day word ("tomorrow", "Friday"), or explicit importance ("urgent", "important", "low priority").
- Everything you choose or infer is "ai".
- If the user named a part of the day ("in the morning", "this evening", "tonight"), set timeWindow and pick a startTime inside it; that startTime source is "ai".

Deadlines
- Only set deadlineDate / deadlineTime when the user gave one ("before 2 PM", "by Friday", "due tomorrow"). Never invent a deadline.
- A task with a deadline must finish before it.

Scheduling
- Order tasks sensibly and never overlap them with each other or with the busy blocks, unless the user asked for overlap.
- Respect usual working hours if given; otherwise plan between 07:00 and 21:30.
- Use the learned habits for any value the user did not state (e.g. their usual exercise time or study length). The user's explicit words always win.
- Durations: use the user's if given, else the habit, else a realistic estimate.

Asking instead of guessing
- If essential information for an activity is missing or too vague to schedule (e.g. "sometime next week", "soon", "later" with no day), do NOT create that task. Add a short question to "questions" with 2-4 tappable answer options, and set "about" to the activity.
- If the request contains no tasks at all, return no tasks and one question asking what they would like to plan.
- If "clarifications" answer an earlier question, use those answers and do not ask again.
- If "keepTasks" are given, the user already approved them: do not return them again, plan only the rest.

Summary and assumptions
- summary: one or two friendly sentences.
- assumptions: short notes on anything you assumed (e.g. "Assumed the report takes about 2 hours").`;

function zonedNow(timezone, now = new Date()) {
  let zone = 'UTC';
  try {
    if (timezone) {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      zone = timezone;
    }
  } catch {
    zone = 'UTC';
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long',
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    timezone: zone,
    today: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    weekday: parts.weekday,
  };
}

/** Prefer the device's own date/time when it is plausible (within a day of the server's view). */
function resolveNow({ timezone, clientToday, clientTime, now = new Date() }) {
  const server = zonedNow(timezone, now);
  if (isValidDateKey(clientToday) && isValidTime(clientTime)) {
    const diff = Math.abs(Date.parse(`${clientToday}T00:00:00Z`) - Date.parse(`${server.today}T00:00:00Z`));
    if (diff <= 24 * 60 * 60 * 1000) {
      const weekday = new Date(`${clientToday}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      return { ...server, today: clientToday, minutes: minutesFromTime(clientTime), weekday };
    }
  }
  return server;
}

function busyBlocks(existingTasks, fromDate) {
  return (existingTasks || [])
    .filter((task) => !task.completed && task.dueDate && task.dueDate >= fromDate && minutesFromTime(task.startTime) !== null)
    .map((task) => {
      const start = minutesFromTime(task.startTime);
      const hours = /(\d+)\s*h/.exec(task.duration || '');
      const mins = /(\d+)\s*m/.exec(task.duration || '');
      const length = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0) || 60;
      return { date: task.dueDate, start, end: start + length, title: task.title };
    });
}

function buildPrompt({ message, answers, keepTasks, clock, busy, profile }) {
  const context = {
    today: clock.today,
    weekday: clock.weekday,
    localTime: timeFromMinutes(clock.minutes),
    timezone: clock.timezone,
    request: message,
    clarifications: answers?.length ? answers : undefined,
    keepTasks: keepTasks?.length
      ? keepTasks.map((task) => ({ title: task.title, date: task.date, startTime: task.startTime, durationMinutes: task.durationMinutes }))
      : undefined,
    // Times only: Gemini does not need the titles of the user's other tasks.
    busy: busy
      .filter((block) => block.date <= addDays(clock.today, 7))
      .slice(0, 60)
      .map((block) => ({ date: block.date, start: timeFromMinutes(block.start), end: timeFromMinutes(block.end) })),
    ...promptSummary(profile),
  };
  return `${SYSTEM_PROMPT}\n\nContext:\n${JSON.stringify(context)}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function windowAllows(window, start) {
  if (!window) return true;
  const minutes = minutesFromTime(start);
  const [lo, hi] = WINDOW_BOUNDS[window];
  return minutes !== null && minutes >= lo && minutes < hi;
}

function deadlineMinutes(task) {
  if (!task.deadline || !task.deadline.includes('T')) return null;
  const [date, time] = task.deadline.split('T');
  return date === task.date ? minutesFromTime(time) : null;
}

/** Fills values the user did not state from this user's learned habits; marks them as 'habit'. */
function applyHabits(tasks, profile) {
  return tasks.map((task) => {
    const next = { ...task, sources: { ...task.sources } };
    const habit = habitFor(profile, task.type);
    if (habit?.durationMinutes && next.sources.durationMinutes !== 'user') {
      next.durationMinutes = habit.durationMinutes;
      next.sources.durationMinutes = 'habit';
    }
    if (!next.durationMinutes) {
      next.durationMinutes = DEFAULT_DURATION[task.type] || 30;
      next.sources.durationMinutes = 'ai';
    }
    if (habit?.start && next.sources.startTime !== 'user' && windowAllows(next.timeWindow, habit.start)) {
      const limit = deadlineMinutes(next);
      if (limit === null || minutesFromTime(habit.start) + next.durationMinutes <= limit) {
        next.startTime = habit.start;
        next.sources.startTime = 'habit';
      }
    }
    if (habit?.priority && next.sources.priority !== 'user') {
      next.priority = habit.priority;
      next.sources.priority = 'habit';
    }
    return next;
  });
}

function overlapping(blocks, date, start, end) {
  return blocks.filter((block) => block.date === date && start < block.end && block.start < end);
}

function nearestFreeSlot(blocks, date, lo, hi, duration, preferred) {
  let best = null;
  for (let start = lo; start + duration <= hi; start += STEP) {
    if (overlapping(blocks, date, start, start + duration).length) continue;
    if (best === null || Math.abs(start - preferred) < Math.abs(best - preferred)) best = start;
  }
  return best;
}

function roundUp(minutes, step) {
  return Math.ceil(minutes / step) * step;
}

/**
 * Places tasks so they do not overlap existing tasks or each other.
 * Times the user stated are kept (with a warning if they clash or have passed);
 * suggested times move to the nearest free slot inside their window/deadline.
 */
function scheduleTasks(tasks, { busy, clock, workingHours }) {
  const blocks = busy.map((block) => ({ ...block }));
  const placed = tasks.map((task, index) => ({ ...task, warnings: [], index }));
  const day = workingHours?.start && workingHours?.end
    ? [minutesFromTime(workingHours.start), Math.max(minutesFromTime(workingHours.end), minutesFromTime(workingHours.start) + 60)]
    : DEFAULT_DAY;

  const fixed = placed.filter((task) => task.sources.startTime === 'user' && task.startTime);
  const flexible = placed
    .filter((task) => !fixed.includes(task))
    .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
      || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))
      || a.index - b.index);

  for (const task of fixed) {
    const start = minutesFromTime(task.startTime);
    const end = start + task.durationMinutes;
    const clashes = overlapping(blocks, task.date, start, end);
    if (clashes.length) task.warnings.push(`Overlaps with ${clashes.map((block) => `“${block.title}”`).join(', ')}.`);
    if (task.date === clock.today && start < clock.minutes) task.warnings.push('This time has already passed today.');
    blocks.push({ date: task.date, start, end, title: task.title });
  }

  for (const task of flexible) {
    const duration = task.durationMinutes;
    let [lo, hi] = task.timeWindow ? WINDOW_BOUNDS[task.timeWindow] : day;
    if (task.date === clock.today) lo = Math.max(lo, roundUp(clock.minutes + 5, STEP));
    const limit = deadlineMinutes(task);
    if (limit !== null) hi = Math.min(hi, limit);
    const proposed = minutesFromTime(task.startTime);
    // A learned habit (e.g. 06:00 workouts) defines the user's day, so it may sit outside the default hours.
    if (task.sources.startTime === 'habit' && proposed !== null && !task.timeWindow) {
      lo = Math.min(lo, Math.max(proposed, task.date === clock.today ? roundUp(clock.minutes + 5, STEP) : 0));
      hi = Math.max(hi, Math.min(proposed + duration, limit ?? 24 * 60));
    }
    const preferred = proposed ?? lo;
    const fits = proposed !== null
      && proposed >= lo && proposed + duration <= hi
      && !overlapping(blocks, task.date, proposed, proposed + duration).length;
    let start = proposed;
    if (!fits) {
      const slot = nearestFreeSlot(blocks, task.date, lo, hi, duration, preferred);
      if (slot !== null) {
        if (proposed !== null && slot !== proposed) {
          const clashes = overlapping(blocks, task.date, proposed, proposed + duration);
          task.adjustedNote = clashes.length
            ? `Moved to ${timeFromMinutes(slot)} to avoid overlapping ${clashes.map((block) => `“${block.title}”`).join(', ')}.`
            : `Moved to ${timeFromMinutes(slot)} to fit your ${task.timeWindow || 'day'}${limit !== null ? ' and deadline' : ''}.`;
        }
        start = slot;
      } else {
        task.warnings.push(limit !== null
          ? 'There is no free time before the deadline. Pick a time yourself or move something.'
          : task.date === clock.today && lo >= hi
            ? `The ${task.timeWindow || 'day'} has already passed. Pick another time.`
            : 'No free slot found. Pick a time yourself.');
        start = proposed ?? Math.min(Math.max(lo, day[0]), 23 * 60);
      }
    }
    task.startTime = timeFromMinutes(start);
    blocks.push({ date: task.date, start, end: start + duration, title: task.title });
  }

  return placed
    .sort((a, b) => a.date.localeCompare(b.date) || minutesFromTime(a.startTime) - minutesFromTime(b.startTime))
    .map(({ index, ...task }) => task);
}

function sanitizeOriginal(original) {
  if (!original || typeof original !== 'object') return undefined;
  const sources = {};
  for (const field of ['date', 'startTime', 'durationMinutes', 'priority']) {
    sources[field] = ['user', 'ai', 'habit'].includes(original.sources?.[field]) ? original.sources[field] : 'ai';
  }
  return {
    startTime: isValidTime(original.startTime) ? original.startTime : null,
    durationMinutes: Number.isFinite(Number(original.durationMinutes)) ? Number(original.durationMinutes) : null,
    priority: ['low', 'medium', 'high'].includes(original.priority) ? original.priority : null,
    sources,
  };
}

/** Normalises tasks the user already approved in the preview so they are kept as-is. */
function sanitizeKeepTasks(keepTasks, today) {
  return (Array.isArray(keepTasks) ? keepTasks : []).slice(0, 20).flatMap((task) => {
    const title = typeof task?.title === 'string' ? task.title.trim().slice(0, 200) : '';
    if (!title || !isValidDateKey(task.date) || task.date < today) return [];
    const duration = Number(task.durationMinutes);
    return [{
      title,
      description: typeof task.description === 'string' ? task.description.slice(0, 2000) : null,
      type: task.type || 'other',
      date: task.date,
      startTime: isValidTime(task.startTime) ? task.startTime : null,
      durationMinutes: Number.isFinite(duration) && duration >= 5 && duration <= 1440 ? Math.round(duration) : 30,
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
      deadline: typeof task.deadline === 'string' ? task.deadline : null,
      timeWindow: null,
      // Approved by the user in the preview: treat every value as theirs.
      sources: { date: 'user', startTime: 'user', durationMinutes: 'user', priority: 'user' },
      note: null,
      original: sanitizeOriginal(task.original),
    }];
  });
}

/**
 * @returns {Promise<{ planId, summary, tasks, questions, assumptions, today }>}
 */
async function createPlan({ message, answers, keepTasks, timezone, clientToday, clientTime, existingTasks, profile, generate = geminiJson, now }) {
  // `now` is only passed by tests, so a fixed date keeps working on any day.
  const clock = resolveNow({ timezone, clientToday, clientTime, now });
  const busy = busyBlocks(existingTasks, clock.today);
  const kept = sanitizeKeepTasks(keepTasks, clock.today);
  const raw = await generate(
    [{ role: 'user', parts: [{ text: buildPrompt({ message, answers, keepTasks: kept, clock, busy, profile }) }] }],
    { responseSchema: PLAN_RESPONSE_SCHEMA, deadlineMs: PLAN_DEADLINE_MS },
  );
  const plan = validatePlan(raw, { today: clock.today });
  const keptTitles = new Set(kept.map((task) => task.title.toLowerCase()));
  const fresh = applyHabits(plan.tasks.filter((task) => !keptTitles.has(task.title.toLowerCase())), profile);
  const tasks = scheduleTasks([...kept, ...fresh], { busy, clock, workingHours: profile?.workingHours });
  return {
    planId: randomUUID(),
    summary: plan.summary,
    tasks: tasks.map((task) => ({
      ...task,
      // What ORDINA proposed, so the confirm step can learn from the user's edits.
      original: task.original
        ?? { startTime: task.startTime, durationMinutes: task.durationMinutes, priority: task.priority, sources: task.sources },
    })),
    questions: plan.questions,
    assumptions: plan.assumptions,
    today: clock.today,
    repaired: plan.repaired,
  };
}

module.exports = {
  WINDOW_BOUNDS,
  applyHabits,
  buildPrompt,
  busyBlocks,
  createPlan,
  resolveNow,
  sanitizeKeepTasks,
  scheduleTasks,
  zonedNow,
};
