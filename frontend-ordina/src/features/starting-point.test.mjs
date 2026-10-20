// Unit tests for turning intro answers into defaults. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestTime, defaultCategory, defaultReminderLead } from './starting-point.ts';

test('best working hours become the first suggested time', () => {
  assert.equal(bestTime({ energy: ['early'] }), '07:00');
  assert.equal(bestTime({ energy: ['night'] }), '20:30');
  assert.equal(bestTime({}), undefined);
});

test('the reminder answer sets the reminder of a new task', () => {
  assert.equal(defaultReminderLead({ reminders: ['before'] }, 'low'), 10);
  assert.equal(defaultReminderLead({ reminders: ['night'] }, 'low'), 1440);
  assert.equal(defaultReminderLead({ reminders: ['important'] }, 'medium'), null);
  assert.equal(defaultReminderLead({ reminders: ['important'] }, 'high'), 30);
  assert.equal(defaultReminderLead({ reminders: ['none'] }, 'high'), null);
  assert.equal(defaultReminderLead({}, 'high'), null);
});

test('a new task starts in the user\'s own area', () => {
  assert.equal(defaultCategory({ focus: ['study'] }), 'study');
  assert.equal(defaultCategory({ focus: ['finance', 'health'] }), 'fitness');
  assert.equal(defaultCategory({}), 'personal');
});
