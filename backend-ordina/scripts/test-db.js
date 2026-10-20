const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDatabasePath = path.join(os.tmpdir(), `ordina-db-test-${process.pid}.sqlite`);
process.env.DATABASE_PATH = testDatabasePath;
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
}

const { db, initializeDatabase, closeDatabase } = require('../src/db');

try {
  initializeDatabase();

  const user = db.prepare(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('ada@example.com', 'hash', 'Ada');
  assert.equal(user.changes, 1);

  const category = db.prepare(
    'INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)'
  ).run(user.lastInsertRowid, 'Work', '#2563eb');
  assert.equal(category.changes, 1);

  const task = db.prepare(
    'INSERT INTO tasks (user_id, title, description, priority) VALUES (?, ?, ?, ?)'
  ).run(user.lastInsertRowid, 'Ship database layer', 'Verify SQLite setup', 2);
  assert.equal(task.changes, 1);

  db.prepare('INSERT INTO task_categories (task_id, category_id) VALUES (?, ?)')
    .run(task.lastInsertRowid, category.lastInsertRowid);

  const readTask = db.prepare(`
    SELECT tasks.title, tasks.priority, categories.name AS category_name
    FROM tasks
    JOIN task_categories ON task_categories.task_id = tasks.id
    JOIN categories ON categories.id = task_categories.category_id
    WHERE tasks.id = ?
  `).get(task.lastInsertRowid);
  assert.deepEqual(readTask, {
    title: 'Ship database layer',
    priority: 2,
    category_name: 'Work'
  });

  db.prepare("UPDATE tasks SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(task.lastInsertRowid);
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.lastInsertRowid).status, 'completed');

  assert.throws(
    () => db.prepare('INSERT INTO tasks (user_id, title) VALUES (?, ?)').run(999999, 'Invalid owner'),
    /FOREIGN KEY constraint failed/
  );

  db.prepare('DELETE FROM users WHERE id = ?').run(user.lastInsertRowid);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM categories').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_categories').get().count, 0);

  console.log('Database CRUD and constraint checks passed.');
} finally {
  closeDatabase();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
  }
}