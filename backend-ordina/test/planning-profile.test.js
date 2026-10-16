const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyTaskType,
  computeProfile,
  correctionsFrom,
  mergeCorrections,
  promptSummary,
  weightedMedian,
} = require('../src/lib/planning-profile');

test('task types are recognised from everyday wording', () => {
  assert.equal(classifyTaskType('Exercise for 30 minutes'), 'exercise');
  assert.equal(classifyTaskType('Go to the gym'), 'exercise');
  assert.equal(classifyTaskType('Study Python'), 'study');
  assert.equal(classifyTaskType('Call my mentor'), 'call');
  assert.equal(classifyTaskType('Finish project report'), 'work');
  assert.equal(classifyTaskType('Buy groceries'), 'errand');
  assert.equal(classifyTaskType('Something unusual'), 'other');
  assert.equal(classifyTaskType('Something unusual', '', 'meal'), 'meal');
});

test('weighted median favours heavier samples', () => {
  assert.equal(weightedMedian([{ value: 1, weight: 1 }, { value: 5, weight: 1 }, { value: 9, weight: 1 }]), 5);
  assert.equal(weightedMedian([{ value: 1, weight: 1 }, { value: 9, weight: 3 }]), 9);
  assert.equal(weightedMedian([]), null);
});

test('a brand-new user has no habits', () => {
  const profile = computeProfile([], []);
  assert.deepEqual(profile.habits, {});
  assert.equal(profile.workingHours, null);
  assert.deepEqual(promptSummary(profile).habits, []);
});

test('habits need enough evidence before they are used', () => {
  const twoRuns = [
    { title: 'Morning run', startTime: '06:30', duration: '0h 45m', priority: 2 },
    { title: 'Run', startTime: '06:30', duration: '0h 45m', priority: 2 },
  ];
  assert.equal(computeProfile(twoRuns).habits.exercise, undefined);
  const threeRuns = [...twoRuns, { title: 'Run', startTime: '07:00', duration: '0h 45m', priority: 2 }];
  const habit = computeProfile(threeRuns).habits.exercise;
  assert.equal(habit.start, '06:30');
  assert.equal(habit.durationMinutes, 45);
  assert.equal(habit.priority, 'medium');
});

test('one correction outweighs two older tasks', () => {
  const history = [
    { title: 'Exercise', startTime: '19:00', duration: '0h 30m', priority: 2 },
    { title: 'Exercise', startTime: '19:00', duration: '0h 30m', priority: 2 },
  ];
  const corrections = [{ type: 'exercise', field: 'startTime', to: '06:00' }];
  assert.equal(computeProfile(history, corrections).habits.exercise.start, '06:00');
});

test('corrections are only recorded for values the AI suggested', () => {
  const corrections = correctionsFrom([
    {
      title: 'Exercise',
      startTime: '06:00',
      durationMinutes: 45,
      priority: 'medium',
      original: { startTime: '19:00', durationMinutes: 30, priority: 'medium', sources: { startTime: 'ai', durationMinutes: 'user', priority: 'ai' } },
    },
    { title: 'Call mentor', startTime: '18:00', original: { startTime: '18:00', sources: { startTime: 'user' } } },
    { title: 'No original', startTime: '10:00' },
  ], new Date('2026-10-15T10:00:00Z'));
  assert.deepEqual(corrections, [
    { type: 'exercise', field: 'startTime', from: '19:00', to: '06:00', at: '2026-10-15T10:00:00.000Z' },
  ]);
});

test('stored corrections are capped', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ i }));
  assert.equal(mergeCorrections(many, [{ i: 'new' }]).length, 40);
  assert.deepEqual(mergeCorrections(many, [{ i: 'new' }]).at(-1), { i: 'new' });
});

test('the prompt summary never includes task titles', () => {
  const profile = computeProfile([
    { title: 'Secret project Falcon report', startTime: '09:00', duration: '2h 0m', priority: 3 },
    { title: 'Secret project Falcon slides', startTime: '09:00', duration: '2h 0m', priority: 3 },
    { title: 'Secret project Falcon email', startTime: '09:30', duration: '2h 0m', priority: 3 },
  ]);
  const text = JSON.stringify(promptSummary(profile));
  assert.doesNotMatch(text, /Falcon/);
  assert.match(text, /"type":"work"/);
});
