// Backup file checks and import rules. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BackupError, backupFileName, buildBackup, nextBackupReminder, parseBackup, planImport } from './backup.ts';

const T0 = '2026-10-19T10:00:00.000Z';
const T1 = '2026-10-19T12:00:00.000Z';
const task = (id, fields = {}) => ({
  id, title: `Task ${id}`, description: null, status: 'pending', priority: 'medium', category_id: 'cat-work', due_date: '2026-10-20',
  start_time: null, duration: null, deadline: null, reminder: 'none', reminder_at: null, completed_at: null, created_at: T0, updated_at: T0, ...fields,
});
const category = (id, fields = {}) => ({ id, name: '', color: '#5C4DF2', icon: 'briefcase-outline', position: 0, default_key: 'work', created_at: T0, updated_at: T0, ...fields });
const file = (tasks, categories = [category('cat-work'), category('cat-other', { default_key: 'other' })], settings = {}) =>
  JSON.stringify(buildBackup(tasks, categories, settings, new Date(T1)));

test('a backup round-trips through the file', () => {
  const backup = parseBackup(file([task('a', { start_time: '09:00', duration: '1h 30m', reminder: '15' })], undefined, { weekStart: 'sunday', lastExportAt: T0 }));
  assert.equal(backup.tasks.length, 1);
  assert.equal(backup.tasks[0].duration, '1h 30m');
  assert.deepEqual(backup.settings, { weekStart: 'sunday' }, 'phone-only settings are not exported');
  assert.equal(backupFileName(new Date(2026, 9, 19)), 'ORDINA-backup-2026-10-19.json');
});

test('broken or foreign files are refused', () => {
  const problem = (text) => {
    try {
      parseBackup(text);
      return 'accepted';
    } catch (error) {
      assert.ok(error instanceof BackupError);
      return error.problem;
    }
  };
  assert.equal(problem('not json {'), 'notJson');
  assert.equal(problem('{"hello":1}'), 'notOrdina');
  assert.equal(problem(JSON.stringify({ app: 'ordina', format: 99, tasks: [], categories: [] })), 'newerFormat');
  assert.equal(problem(file([task('a', { title: '' })])), 'invalid');
  assert.equal(problem(file([task('a', { start_time: '25:00' })])), 'invalid');
  assert.equal(problem(file([task('a', { status: 'weird' })])), 'invalid');
  assert.equal(problem(file([task('a'), task('a')])), 'invalid', 'duplicate ids');
  assert.equal(problem(file([task('../x')])), 'invalid');
});

test('merge adds what is missing and never duplicates', () => {
  const backup = parseBackup(file([task('a'), task('b')]));
  const plan = planImport({ tasks: [{ id: 'a', updated_at: T0 }], categories: [{ id: 'cat-work', updated_at: T0 }] }, backup, 'merge');
  assert.deepEqual(plan.tasks.map((t) => t.id), ['b']);
  assert.deepEqual(plan.counts, { added: 1, updated: 0, unchanged: 1, removed: 0 });
  assert.deepEqual(plan.removeTaskIds, []);
  assert.deepEqual(plan.settings, {}, 'merge keeps phone settings');
  const again = planImport({ tasks: [{ id: 'a', updated_at: T0 }, { id: 'b', updated_at: T0 }], categories: [] }, backup, 'merge');
  assert.equal(again.tasks.length, 0, 'importing twice adds nothing');
});

test('merge: the most recently changed copy wins', () => {
  const backup = parseBackup(file([task('a', { title: 'From file', updated_at: T1 }), task('b', { title: 'Old in file', updated_at: T0 })]));
  const plan = planImport({ tasks: [{ id: 'a', updated_at: T0 }, { id: 'b', updated_at: T1 }], categories: [] }, backup, 'merge');
  assert.deepEqual(plan.tasks.map((t) => t.title), ['From file']);
});

test('replace leaves exactly the file on the phone', () => {
  const backup = parseBackup(file([task('a')], undefined, { weekStart: 'sunday' }));
  const plan = planImport({ tasks: [{ id: 'a', updated_at: T0 }, { id: 'phone-only', updated_at: T1 }], categories: [{ id: 'cat-mine', updated_at: T0 }] }, backup, 'replace');
  assert.deepEqual(plan.removeTaskIds, ['phone-only']);
  assert.deepEqual(plan.removeCategoryIds, ['cat-mine']);
  assert.deepEqual(plan.settings, { weekStart: 'sunday' });
});

test('tasks whose category is missing move to "Other"', () => {
  const backup = parseBackup(file([task('a', { category_id: 'cat-gone' })]));
  const plan = planImport({ tasks: [], categories: [] }, backup, 'replace');
  assert.equal(plan.tasks[0].category_id, 'cat-other');
});

test('backup reminder after 7 or 30 days', () => {
  assert.equal(nextBackupReminder('2026-10-01T00:00:00.000Z', T0, 'weekly').toISOString(), '2026-10-08T00:00:00.000Z');
  assert.equal(nextBackupReminder(null, '2026-10-01T00:00:00.000Z', 'monthly').toISOString(), '2026-10-31T00:00:00.000Z');
});
