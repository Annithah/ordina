// Sync rules: records, last change wins, deletions. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldApply, toRecord, validRecord } from './sync.ts';

const T0 = '2026-10-19T10:00:00.000Z';
const T1 = '2026-10-19T12:00:00.000Z';
const row = (fields = {}) => ({
  id: 'a', title: 'Gym', description: null, status: 'pending', priority: 'medium', category_id: 'cat-health', due_date: '2026-10-20',
  start_time: '18:00', duration: '1h 0m', deadline: null, reminder: '15', reminder_at: null, completed_at: null,
  created_at: T0, updated_at: T0, deleted_at: null, dirty: 1, ...fields,
});

test('a phone row becomes a sync record without phone-only fields', () => {
  const record = toRecord('task', row());
  assert.equal(record.deleted, false);
  assert.equal(record.updatedAt, T0);
  assert.equal('dirty' in record.data, false);
  assert.equal('deleted_at' in record.data, false);
  const deletion = toRecord('task', row({ deleted_at: T1, updated_at: T1 }));
  assert.deepEqual([deletion.deleted, deletion.data], [true, null]);
});

test('the most recent change wins', () => {
  assert.equal(shouldApply({ updated_at: T0, dirty: 0 }, { updatedAt: T1, deleted: false }), true);
  assert.equal(shouldApply({ updated_at: T1, dirty: 1 }, { updatedAt: T0, deleted: false }), false);
  assert.equal(shouldApply({ updated_at: T1, dirty: 0 }, { updatedAt: T0, deleted: true }), false, 'an older deletion loses to a newer edit');
  assert.equal(shouldApply({ updated_at: T0, dirty: 1 }, { updatedAt: T1, deleted: true }), true, 'a newer deletion wins');
});

test('ties keep an unsent phone change', () => {
  assert.equal(shouldApply({ updated_at: T0, dirty: 1 }, { updatedAt: T0, deleted: false }), false);
  assert.equal(shouldApply({ updated_at: T0, dirty: 0 }, { updatedAt: T0, deleted: false }), true);
});

test('new records arrive; deletions of unknown records are ignored', () => {
  assert.equal(shouldApply(null, { updatedAt: T0, deleted: false }), true);
  assert.equal(shouldApply(undefined, { updatedAt: T0, deleted: true }), false);
});

test('records from the server are checked before use', () => {
  const { dirty, deleted_at, ...data } = row();
  assert.ok(validRecord({ kind: 'task', id: 'a', data, updatedAt: T0, deleted: false }));
  assert.ok(validRecord({ kind: 'task', id: 'a', data: null, updatedAt: T0, deleted: true }));
  assert.equal(validRecord({ kind: 'task', id: 'b', data, updatedAt: T0, deleted: false }), null, 'id must match');
  assert.equal(validRecord({ kind: 'task', id: 'a', data: { ...data, start_time: '99:99' }, updatedAt: T0 }), null);
  assert.equal(validRecord({ kind: 'note', id: 'a', data, updatedAt: T0 }), null);
  assert.equal(validRecord({ kind: 'task', id: 'a', data, updatedAt: 'yesterday' }), null);
  assert.equal(validRecord('nonsense'), null);
});
