// The phone database migrations, run on a real SQLite database (node:sqlite). Run with: npm test
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { SCHEMA_VERSION, migrations } from './migrations.ts';

const NOW = '2026-10-19T10:00:00.000Z';

/** Same steps as services/database.ts: each migration and its version bump in one transaction. */
function migrate(db) {
  const steps = migrations(NOW);
  let version = db.prepare('PRAGMA user_version').get().user_version;
  for (; version < steps.length; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(steps[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** A phone that ran the first test APK: version 1 table, user_version 0. */
function version1Phone() {
  const db = new DatabaseSync(':memory:');
  db.exec(migrations(NOW)[0]);
  const insert = db.prepare(`INSERT INTO tasks (id, title, description, status, priority, category, due_date, start_time, duration, deadline, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run('a', 'Study Python', 'chapter 3', 'pending', 'high', 'learning', '2026-10-16', '08:00', '2h 0m', null, null, NOW, NOW);
  insert.run('b', 'Gym', null, 'completed', 'medium', 'health', '2026-10-16', '18:00', '1h 0m', null, NOW, NOW, NOW);
  insert.run('c', 'Old errand', null, 'pending', 'low', 'database', null, null, null, '2026-10-20', null, NOW, NOW);
  insert.run('d', 'No category', null, 'pending', 'medium', null, '2026-10-17', null, '1h 0m', null, null, NOW, NOW);
  return db;
}

test('a version 1 phone keeps every task and field after the update', () => {
  const db = version1Phone();
  const before = db.prepare('SELECT id, title, description, status, priority, due_date, start_time, duration, deadline, completed_at FROM tasks ORDER BY id').all();
  migrate(db);
  const after = db.prepare('SELECT id, title, description, status, priority, due_date, start_time, duration, deadline, completed_at FROM tasks ORDER BY id').all();
  assert.deepEqual(after, before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
});

test('old categories move to the new default categories', () => {
  const db = version1Phone();
  migrate(db);
  const rows = db.prepare('SELECT id, category, category_id, reminder, deleted_at, dirty FROM tasks ORDER BY id').all();
  assert.deepEqual(rows.map((r) => [r.id, r.category_id]), [['a', 'cat-study'], ['b', 'cat-health'], ['c', 'cat-errands'], ['d', 'cat-other']]);
  assert.equal(rows[0].category, 'learning', 'the old column is kept');
  assert.ok(rows.every((r) => r.reminder === 'none' && r.deleted_at === null && r.dirty === 1), 'new tasks fields have safe defaults; dirty so they back up');
});

test('the 8 default categories are created once', () => {
  const db = version1Phone();
  migrate(db);
  migrate(db);
  const cats = db.prepare('SELECT id, default_key FROM categories ORDER BY position').all();
  assert.deepEqual(cats.map((c) => c.default_key), ['work', 'study', 'personal', 'health', 'family', 'finance', 'errands', 'other']);
});

test('a fresh install gets the full schema', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((t) => t.name);
  assert.deepEqual(tables, ['app_settings', 'categories', 'plan_confirmations', 'tasks']);
});

test('migrations never drop or rename anything', () => {
  for (const sql of migrations(NOW)) assert.doesNotMatch(sql, /\b(DROP|RENAME)\b/i);
});
