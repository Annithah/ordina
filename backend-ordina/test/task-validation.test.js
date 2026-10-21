const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidDateKey,
  isValidTime,
  parseDurationMinutes,
  validateTaskInput,
} = require('../src/lib/task-validation');

test('a title is required when creating a task', () => {
  assert.equal(validateTaskInput({}).errors.title, 'Please add a task title.');
  assert.equal(validateTaskInput({ title: '   ' }).errors.title, 'Please add a task title.');
  const { value, errors } = validateTaskInput({ title: '  Call mentor  ' });
  assert.deepEqual(errors, {});
  assert.equal(value.title, 'Call mentor');
});

test('titles and descriptions have length limits', () => {
  assert.ok(validateTaskInput({ title: 'x'.repeat(201) }).errors.title);
  assert.ok(validateTaskInput({ title: 'ok', description: 'x'.repeat(2001) }).errors.description);
});

test('partial updates only check the fields that are sent', () => {
  const { value, errors } = validateTaskInput({ startTime: '18:30' }, { partial: true });
  assert.deepEqual(errors, {});
  assert.deepEqual(value, { startTime: '18:30' });
  assert.ok(validateTaskInput({ title: '' }, { partial: true }).errors.title);
});

test('dates must be real calendar days', () => {
  assert.equal(isValidDateKey('2026-10-15'), true);
  assert.equal(isValidDateKey('2028-02-29'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('15/10/2026'), false);
  assert.ok(validateTaskInput({ title: 'a', dueDate: '2026-02-30' }).errors.dueDate);
  assert.equal(validateTaskInput({ title: 'a', date: '2026-10-16' }).value.dueDate, '2026-10-16');
});

test('times use 24-hour HH:MM', () => {
  assert.equal(isValidTime('00:00'), true);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('9:00'), false);
  assert.equal(isValidTime('09:60'), false);
  assert.equal(validateTaskInput({ title: 'a', startTime: '' }).value.startTime, null);
  assert.ok(validateTaskInput({ title: 'a', startTime: '7pm' }).errors.startTime);
});

test('durations are normalised and bounded', () => {
  assert.equal(parseDurationMinutes('1h 30m'), 90);
  assert.equal(parseDurationMinutes('45m'), 45);
  assert.equal(parseDurationMinutes('2h'), 120);
  assert.equal(parseDurationMinutes(30), 30);
  assert.equal(parseDurationMinutes('soon'), null);
  assert.equal(validateTaskInput({ title: 'a', durationMinutes: 90 }).value.duration, '1h 30m');
  assert.ok(validateTaskInput({ title: 'a', durationMinutes: 2 }).errors.duration);
  assert.ok(validateTaskInput({ title: 'a', duration: '25h' }).errors.duration);
});

test('priority, status and category are restricted to valid values', () => {
  assert.equal(validateTaskInput({ title: 'a', priority: 3 }).value.priority, 'high');
  assert.equal(validateTaskInput({ title: 'a', priority: 'Medium' }).value.priority, 'medium');
  assert.ok(validateTaskInput({ title: 'a', priority: 'urgent' }).errors.priority);
  assert.equal(validateTaskInput({ title: 'a', status: 'todo' }).value.status, 'pending');
  assert.ok(validateTaskInput({ title: 'a', status: 'done' }).errors.status);
  assert.equal(validateTaskInput({ title: 'a', category: 'Health' }).value.category, 'health');
  // Users create their own categories on the phone: any short lowercase id is accepted.
  assert.equal(validateTaskInput({ title: 'a', category: 'exams' }).value.category, 'exams');
  assert.equal(validateTaskInput({ title: 'a', category: '3f2a-9c1d' }).value.category, '3f2a-9c1d');
  assert.ok(validateTaskInput({ title: 'a', category: 'not a category!' }).errors.category);
});
