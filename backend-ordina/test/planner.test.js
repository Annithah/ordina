const test = require('node:test');
const assert = require('node:assert/strict');

const { applyHabits, buildPrompt, createPlan, resolveNow, scheduleTasks, zonedNow } = require('../src/lib/planner');

const clock = { today: '2026-10-15', minutes: 8 * 60, timezone: 'Africa/Kigali', weekday: 'Thursday' };

function planTask(overrides = {}) {
  return {
    title: 'Task',
    description: null,
    type: 'other',
    date: '2026-10-15',
    startTime: null,
    durationMinutes: 60,
    priority: 'medium',
    deadline: null,
    timeWindow: null,
    sources: { date: 'user', startTime: 'ai', durationMinutes: 'ai', priority: 'ai' },
    note: null,
    ...overrides,
  };
}

function overlaps(a, b) {
  const start = (t) => Number(t.startTime.slice(0, 2)) * 60 + Number(t.startTime.slice(3));
  return a.date === b.date && start(a) < start(b) + b.durationMinutes && start(b) < start(a) + a.durationMinutes;
}

test('the local date and time follow the user timezone', () => {
  const instant = new Date('2026-10-15T23:30:00Z');
  assert.equal(zonedNow('Africa/Kigali', instant).today, '2026-10-16');
  assert.equal(zonedNow('America/New_York', instant).today, '2026-10-15');
  assert.equal(zonedNow('Not/AZone', instant).timezone, 'UTC');
});

test('the device date is used when plausible, otherwise the server view', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  assert.equal(resolveNow({ timezone: 'UTC', clientToday: '2026-10-16', clientTime: '00:30', now }).today, '2026-10-16');
  assert.equal(resolveNow({ timezone: 'UTC', clientToday: '2027-01-01', clientTime: '09:00', now }).today, '2026-10-15');
  assert.equal(resolveNow({ timezone: 'UTC', clientToday: 'bad', clientTime: '09:00', now }).minutes, 600);
});

test('suggested times never overlap each other or existing tasks', () => {
  const busy = [{ date: '2026-10-15', start: 9 * 60, end: 10 * 60, title: 'Standup' }];
  const tasks = [
    planTask({ title: 'A', startTime: '09:00' }),
    planTask({ title: 'B', startTime: '09:00' }),
    planTask({ title: 'C' }),
  ];
  const placed = scheduleTasks(tasks, { busy, clock });
  for (const task of placed) {
    assert.ok(!overlaps(task, { date: '2026-10-15', startTime: '09:00', durationMinutes: 60 }), `${task.title} overlaps Standup`);
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) assert.ok(!overlaps(placed[i], placed[j]), `${placed[i].title} overlaps ${placed[j].title}`);
  }
  assert.match(placed.find((t) => t.title === 'A').adjustedNote, /Standup/);
});

test('times the user stated are kept, with a warning on a clash', () => {
  const busy = [{ date: '2026-10-15', start: 18 * 60, end: 19 * 60, title: 'Dinner' }];
  const [task] = scheduleTasks([planTask({ title: 'Call mentor', startTime: '18:00', sources: { startTime: 'user' } })], { busy, clock });
  assert.equal(task.startTime, '18:00');
  assert.match(task.warnings[0], /Dinner/);
});

test('nothing is suggested in the past for today', () => {
  const [task] = scheduleTasks([planTask({ startTime: '06:00' })], { busy: [], clock: { ...clock, minutes: 14 * 60 + 2 } });
  assert.equal(task.startTime, '14:15');
});

test('a part of the day and a deadline bound the suggestion', () => {
  const [evening] = scheduleTasks([planTask({ timeWindow: 'evening', startTime: '09:00', durationMinutes: 30 })], { busy: [], clock });
  assert.ok(evening.startTime >= '17:00' && evening.startTime < '21:30');
  const busy = [{ date: '2026-10-15', start: 8 * 60, end: 13 * 60, title: 'Workshop' }];
  const [report] = scheduleTasks([planTask({ durationMinutes: 60, deadline: '2026-10-15T14:00' })], { busy, clock });
  assert.equal(report.startTime, '13:00');
  const [late] = scheduleTasks([planTask({ durationMinutes: 120, deadline: '2026-10-15T14:00' })], { busy, clock });
  assert.match(late.warnings[0], /deadline/);
});

test('learned habits fill only what the user did not say, inside their time window', () => {
  const profile = { habits: { exercise: { start: '06:00', durationMinutes: 45, priority: 'high' } } };
  const [free] = applyHabits([planTask({ type: 'exercise', startTime: '19:00' })], profile);
  assert.equal(free.startTime, '06:00');
  assert.equal(free.sources.startTime, 'habit');
  assert.equal(free.durationMinutes, 45);
  assert.equal(free.priority, 'high');
  const [stated] = applyHabits([planTask({ type: 'exercise', startTime: '19:00', durationMinutes: 30, sources: { startTime: 'user', durationMinutes: 'user', priority: 'user' } })], profile);
  assert.equal(stated.startTime, '19:00');
  assert.equal(stated.durationMinutes, 30);
  assert.equal(stated.priority, 'medium');
  const [evening] = applyHabits([planTask({ type: 'exercise', startTime: '18:00', timeWindow: 'evening' })], profile);
  assert.equal(evening.startTime, '18:00');
});

test('a learned early habit is not pushed into default working hours', () => {
  const tomorrow = { ...clock, minutes: 20 * 60 };
  const [task] = scheduleTasks(
    [planTask({ date: '2026-10-16', startTime: '06:00', durationMinutes: 45, sources: { date: 'user', startTime: 'habit', durationMinutes: 'habit', priority: 'ai' } })],
    { busy: [], clock: tomorrow },
  );
  assert.equal(task.startTime, '06:00');
});

test('a new user gets type-based default durations', () => {
  const [call, study] = applyHabits([planTask({ type: 'call', durationMinutes: null }), planTask({ type: 'study', durationMinutes: null })], null);
  assert.equal(call.durationMinutes, 15);
  assert.equal(study.durationMinutes, 60);
});

test('the prompt carries date, time and timezone but not other task titles', () => {
  const prompt = buildPrompt({
    message: 'Plan my day',
    answers: [],
    keepTasks: [],
    clock,
    busy: [{ date: '2026-10-15', start: 600, end: 660, title: 'Private doctor visit' }],
    profile: null,
  });
  assert.match(prompt, /"today":"2026-10-15"/);
  assert.match(prompt, /"localTime":"08:00"/);
  assert.match(prompt, /"timezone":"Africa\/Kigali"/);
  assert.match(prompt, /"start":"10:00"/);
  assert.doesNotMatch(prompt, /doctor/);
});

test('createPlan validates, keeps approved tasks and returns a plan id', async () => {
  const generate = async () => ({
    summary: 'Plan ready.',
    tasks: [
      { title: 'Study Python', type: 'study', date: '2026-10-16', startTime: '09:00', durationMinutes: 120, priority: 'medium', sources: { date: 'user', startTime: 'ai', durationMinutes: 'user', priority: 'ai' } },
      { title: 'Call mentor', type: 'call', date: '2026-10-16', startTime: '18:00', durationMinutes: 15, priority: 'medium', sources: { date: 'user', startTime: 'user', durationMinutes: 'ai', priority: 'ai' } },
    ],
    questions: [],
    assumptions: [],
  });
  const plan = await createPlan({
    message: 'x',
    timezone: 'UTC',
    clientToday: '2026-10-15',
    clientTime: '08:00',
    keepTasks: [{ title: 'Call mentor', date: '2026-10-16', startTime: '18:30', durationMinutes: 20, priority: 'high' }],
    existingTasks: [],
    profile: null,
    generate,
    now: new Date('2026-10-15T08:00:00Z'),
  });
  assert.match(plan.planId, /^[0-9a-f-]{36}$/);
  assert.equal(plan.tasks.length, 2);
  const call = plan.tasks.find((t) => t.title === 'Call mentor');
  assert.equal(call.startTime, '18:30');
  assert.equal(call.priority, 'high');
  assert.ok(plan.tasks.every((t) => t.original && t.original.sources));
});

test('createPlan surfaces AI failures instead of pretending to succeed', async () => {
  const failing = async () => {
    const error = new Error('busy');
    error.code = 'AI_BUSY';
    error.status = 503;
    throw error;
  };
  await assert.rejects(createPlan({ message: 'x', timezone: 'UTC', existingTasks: [], generate: failing }), { code: 'AI_BUSY' });
  await assert.rejects(createPlan({ message: 'x', timezone: 'UTC', existingTasks: [], generate: async () => 'nope' }), { code: 'AI_INVALID' });
});
