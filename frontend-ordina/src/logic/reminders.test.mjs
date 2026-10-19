// Unit tests for reminder times. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeReminder, reminderTime } from './reminders.ts';

const NOW = new Date(2026, 9, 19, 8, 0);
const task = (fields) => ({ dueDate: '2026-10-20', startTime: '10:00', completed: false, ...fields });
const at = (date) => date && [date.getDate(), date.getHours(), date.getMinutes()];

test('offsets count back from the start time', () => {
  assert.deepEqual(at(reminderTime(task({ reminder: 'start' }), NOW)), [20, 10, 0]);
  assert.deepEqual(at(reminderTime(task({ reminder: '5' }), NOW)), [20, 9, 55]);
  assert.deepEqual(at(reminderTime(task({ reminder: '15' }), NOW)), [20, 9, 45]);
  assert.deepEqual(at(reminderTime(task({ reminder: '30' }), NOW)), [20, 9, 30]);
  assert.deepEqual(at(reminderTime(task({ reminder: '60' }), NOW)), [20, 9, 0]);
  assert.deepEqual(at(reminderTime(task({ reminder: '1440' }), NOW)), [19, 10, 0]);
});

test('custom time, also for Anytime tasks', () => {
  assert.deepEqual(at(reminderTime(task({ startTime: null, reminder: 'custom', reminderAt: '2026-10-20T07:15' }), NOW)), [20, 7, 15]);
  assert.equal(reminderTime(task({ reminder: 'custom', reminderAt: 'nonsense' }), NOW), null);
});

test('nothing to schedule: none, completed, Anytime offsets, or already past', () => {
  assert.equal(reminderTime(task({ reminder: 'none' }), NOW), null);
  assert.equal(reminderTime(task({ reminder: undefined }), NOW), null);
  assert.equal(reminderTime(task({ reminder: '15', completed: true }), NOW), null);
  assert.equal(reminderTime(task({ reminder: '15', startTime: null }), NOW), null);
  assert.equal(reminderTime(task({ reminder: 'start', dueDate: '2026-10-19', startTime: '07:00' }), NOW), null);
});

test('edits keep only a reminder that still makes sense', () => {
  assert.deepEqual(normalizeReminder(task({ reminder: '15', startTime: null })), { reminder: 'none', reminderAt: null });
  assert.deepEqual(normalizeReminder(task({ reminder: 'custom', reminderAt: '2026-10-20T07:15' })), { reminder: 'custom', reminderAt: '2026-10-20T07:15' });
  assert.deepEqual(normalizeReminder(task({ reminder: 'custom', reminderAt: null })), { reminder: 'none', reminderAt: null });
  assert.deepEqual(normalizeReminder(task({ reminder: '30', reminderAt: 'x' })), { reminder: '30', reminderAt: null });
});
