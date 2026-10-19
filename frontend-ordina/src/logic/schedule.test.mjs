// Unit tests for task time, duration and day ordering. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  durationMinutes,
  durationValue,
  findOverlaps,
  groupByDay,
  isOverdue,
  isValidCustomDuration,
} from './schedule.ts';

const task = (id, fields = {}) => ({ id, title: id, completed: false, dueDate: '2026-10-19', startTime: null, duration: null, ...fields });
// Monday 19 October 2026, 15:00.
const NOW = new Date(2026, 9, 19, 15, 0);

test('durations: presets, custom range and "no duration"', () => {
  assert.equal(durationMinutes('1h 30m'), 90);
  assert.equal(durationMinutes('45m'), 45);
  assert.equal(durationMinutes('2h'), 120);
  assert.equal(durationMinutes(null), null);
  assert.equal(durationMinutes(''), null);
  assert.equal(durationValue(null), null);
  assert.equal(durationValue(135), '2h 15m');
  assert.ok(isValidCustomDuration(5));
  assert.ok(isValidCustomDuration(720));
  assert.ok(!isValidCustomDuration(4));
  assert.ok(!isValidCustomDuration(721));
});

test('Anytime tasks are not overdue until their day has ended', () => {
  assert.equal(isOverdue(task('a'), NOW), false);
  assert.equal(isOverdue(task('a'), new Date(2026, 9, 19, 23, 59)), false);
  assert.equal(isOverdue(task('a'), new Date(2026, 9, 20, 0, 1)), true);
  assert.equal(isOverdue(task('a', { completed: true }), new Date(2026, 9, 21)), false);
});

test('timed tasks are overdue after their end time', () => {
  assert.equal(isOverdue(task('t', { startTime: '14:00', duration: '2h 0m' }), NOW), false);
  assert.equal(isOverdue(task('t', { startTime: '14:30', duration: '1h 0m' }), NOW), false);
  assert.equal(isOverdue(task('t', { startTime: '13:00', duration: '1h 0m' }), NOW), true);
  assert.equal(isOverdue(task('t', { startTime: '13:00', duration: '0h 30m' }), NOW), true);
  assert.equal(isOverdue(task('t', { startTime: '13:00' }), NOW), true, 'no duration: overdue after the start');
  assert.equal(isOverdue(task('t', { startTime: '13:00', status: 'in_progress' }), NOW), false);
  assert.equal(isOverdue(task('t', { dueDate: '2026-10-20', startTime: '08:00' }), NOW), false);
});

test('a passed deadline makes a task overdue', () => {
  assert.equal(isOverdue(task('d', { dueDate: '2026-10-25', deadline: '2026-10-19T12:00' }), NOW), true);
  assert.equal(isOverdue(task('d', { dueDate: '2026-10-25', deadline: '2026-10-19' }), NOW), false);
});

test('each day lists timed tasks by time and Anytime tasks apart', () => {
  const groups = groupByDay([
    task('late', { startTime: '18:00' }),
    task('anytime-b'),
    task('early', { startTime: '07:30' }),
    task('tomorrow', { dueDate: '2026-10-20', startTime: '09:00' }),
    task('anytime-a'),
    task('undated', { dueDate: null }),
    task('yesterday', { dueDate: '2026-10-18' }),
  ]);
  assert.deepEqual(groups.map((g) => g.date), ['2026-10-18', '2026-10-19', '2026-10-20', null]);
  assert.deepEqual(groups[1].timed.map((t) => t.id), ['early', 'late']);
  assert.deepEqual(groups[1].anytime.map((t) => t.id), ['anytime-a', 'anytime-b']);
});

test('overlaps: same day, timed, not completed, not itself', () => {
  const tasks = [
    task('gym', { startTime: '18:00', duration: '1h 0m' }),
    task('call', { startTime: '18:30' }),
    task('done', { startTime: '18:15', duration: '0h 30m', completed: true }),
    task('free', { startTime: '19:00', duration: '0h 30m' }),
    task('anytime'),
    task('other-day', { dueDate: '2026-10-20', startTime: '18:00', duration: '1h 0m' }),
  ];
  const clash = findOverlaps(tasks, { id: 'new', dueDate: '2026-10-19', startTime: '18:20', duration: '0h 30m' });
  assert.deepEqual(clash.map((t) => t.id), ['gym', 'call']);
  assert.deepEqual(findOverlaps(tasks, { id: 'gym', dueDate: '2026-10-19', startTime: '18:00', duration: '1h 0m' }).map((t) => t.id), ['call']);
  assert.deepEqual(findOverlaps(tasks, { dueDate: '2026-10-19', startTime: null }), [], 'Anytime never overlaps');
  assert.deepEqual(findOverlaps(tasks, { dueDate: '2026-10-19', startTime: '19:00', duration: '0h 30m' }).map((t) => t.id), ['free']);
});
