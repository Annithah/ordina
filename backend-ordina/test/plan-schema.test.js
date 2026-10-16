const test = require('node:test');
const assert = require('node:assert/strict');

const { PLAN_RESPONSE_SCHEMA, validatePlan } = require('../src/lib/plan-schema');

const today = '2026-10-15';

function task(overrides = {}) {
  return {
    title: 'Study Python',
    type: 'study',
    date: '2026-10-16',
    startTime: '09:00',
    durationMinutes: 120,
    priority: 'medium',
    sources: { date: 'user', startTime: 'ai', durationMinutes: 'user', priority: 'ai' },
    ...overrides,
  };
}

test('the Gemini response schema requires the plan fields', () => {
  assert.deepEqual(PLAN_RESPONSE_SCHEMA.required, ['summary', 'tasks', 'questions', 'assumptions']);
  assert.ok(PLAN_RESPONSE_SCHEMA.properties.tasks.items.properties.sources);
});

test('a well-formed plan passes through unchanged', () => {
  const plan = validatePlan({ summary: 'Your plan.', tasks: [task()], questions: [], assumptions: ['Assumed 2 hours'] }, { today });
  assert.equal(plan.repaired, false);
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].durationMinutes, 120);
  assert.equal(plan.tasks[0].sources.durationMinutes, 'user');
  assert.deepEqual(plan.assumptions, ['Assumed 2 hours']);
});

test('non-object responses are rejected', () => {
  assert.throws(() => validatePlan(null, { today }), { code: 'AI_INVALID' });
  assert.throws(() => validatePlan('tasks', { today }), { code: 'AI_INVALID' });
  assert.throws(() => validatePlan([task()], { today }), { code: 'AI_INVALID' });
});

test('invalid values are repaired and marked as AI suggestions', () => {
  const plan = validatePlan({
    summary: '',
    tasks: [task({ startTime: '7pm', durationMinutes: 0, priority: 'urgent', sources: { startTime: 'user', durationMinutes: 'user', priority: 'user', date: 'user' } })],
  }, { today });
  const [item] = plan.tasks;
  assert.equal(plan.repaired, true);
  assert.equal(item.startTime, null);
  assert.equal(item.sources.startTime, 'ai');
  assert.equal(item.durationMinutes, null);
  assert.equal(item.sources.durationMinutes, 'ai');
  assert.equal(item.priority, 'medium');
  assert.equal(item.sources.priority, 'ai');
  assert.match(plan.summary, /1 task/);
});

test('a task without a usable date becomes a question instead of a guess', () => {
  const plan = validatePlan({
    summary: 'ok',
    tasks: [task({ title: 'Dentist', date: 'next week' }), task({ title: 'Old', date: '2026-10-01' })],
    questions: [],
    assumptions: [],
  }, { today });
  assert.equal(plan.tasks.length, 0);
  assert.equal(plan.questions.length, 2);
  assert.match(plan.questions[0].question, /Dentist/);
  assert.equal(plan.questions[0].id, 'q1');
});

test('deadlines are only kept when valid, and a time alone uses the task date', () => {
  const plan = validatePlan({
    summary: 'ok',
    tasks: [
      task({ title: 'Report', deadlineTime: '14:00' }),
      task({ title: 'Essay', deadlineDate: '2026-10-20', deadlineTime: '25:00' }),
      task({ title: 'Read', deadlineDate: 'friday' }),
    ],
  }, { today });
  assert.equal(plan.tasks[0].deadline, '2026-10-16T14:00');
  assert.equal(plan.tasks[1].deadline, '2026-10-20');
  assert.equal(plan.tasks[2].deadline, null);
});

test('titles, questions and lists are trimmed and capped', () => {
  const plan = validatePlan({
    summary: 'ok',
    tasks: [task({ title: '   ' }), ...Array.from({ length: 25 }, (_, i) => task({ title: `Task ${i}` }))],
    questions: [{ question: 'When?', options: ['a', 'b', 'c', 'd', 'e'] }, { question: '' }],
    assumptions: Array.from({ length: 12 }, () => 'x'),
  }, { today });
  // The cap applies to what Gemini sent (20 items), and the blank one is dropped.
  assert.equal(plan.tasks.length, 19);
  assert.equal(plan.questions.length, 1);
  assert.equal(plan.questions[0].options.length, 4);
  assert.equal(plan.assumptions.length, 8);
  assert.equal(plan.repaired, true);
});

test('the task type comes from the title when it is recognisable', () => {
  const plan = validatePlan({ summary: 'ok', tasks: [task({ title: 'Go to the gym', type: 'work' })] }, { today });
  assert.equal(plan.tasks[0].type, 'exercise');
});
