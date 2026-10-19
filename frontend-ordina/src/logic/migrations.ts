/**
 * Phone database migrations (expo-sqlite). No app imports, so the unit tests run them on a real
 * SQLite database with plain Node.
 *
 * Rules: tables and columns are only ever added, never dropped or renamed, so tasks on testers'
 * phones survive every update. `PRAGMA user_version` records the last migration applied.
 *
 * Version 1 (first test APK) had a single `tasks` table and user_version 0.
 */
import { DEFAULT_CATEGORIES, LEGACY_CATEGORY_IDS, OTHER_CATEGORY_ID } from './categories.ts';

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

const legacyCase = `CASE lower(IFNULL(category, ''))
  ${Object.entries(LEGACY_CATEGORY_IDS).map(([slug, id]) => `WHEN ${quote(slug)} THEN ${quote(id)}`).join('\n  ')}
  ELSE ${quote(OTHER_CATEGORY_ID)} END`;

export function defaultCategoriesSql(now: string) {
  return DEFAULT_CATEGORIES.map((category) =>
    `INSERT OR IGNORE INTO categories (id, name, color, icon, position, default_key, created_at, updated_at, deleted_at, dirty)
     VALUES (${quote(category.id)}, '', ${quote(category.color)}, ${quote(category.icon)}, ${category.position}, ${quote(category.defaultKey ?? '')}, ${quote(now)}, ${quote(now)}, NULL, 1);`,
  ).join('\n');
}

/** Index i holds the SQL that brings the database from version i to version i + 1. */
export function migrations(now: string): string[] {
  return [
    // 0 -> 1: the version 1 schema (already present on phones that ran the first test APK).
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      category TEXT,
      due_date TEXT,
      start_time TEXT,
      duration TEXT,
      deadline TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_due_date ON tasks(due_date);
    CREATE TABLE IF NOT EXISTS plan_confirmations (
      plan_id TEXT PRIMARY KEY NOT NULL,
      task_ids TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,

    // 1 -> 2: categories, reminders, settings and the fields sync needs.
    `ALTER TABLE tasks ADD COLUMN category_id TEXT;
    ALTER TABLE tasks ADD COLUMN reminder TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE tasks ADD COLUMN reminder_at TEXT;
    ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
    ALTER TABLE tasks ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
    UPDATE tasks SET category_id = ${legacyCase};
    CREATE INDEX IF NOT EXISTS tasks_category ON tasks(category_id);
    CREATE INDEX IF NOT EXISTS tasks_live_due ON tasks(deleted_at, due_date);
    CREATE INDEX IF NOT EXISTS tasks_dirty ON tasks(dirty);
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      default_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 1
    );
    ${defaultCategoriesSql(now)}
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
  ];
}

export const SCHEMA_VERSION = migrations('').length;
