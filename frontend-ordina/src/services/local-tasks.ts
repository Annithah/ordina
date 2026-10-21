/**
 * Tasks stored on the phone (expo-sqlite), used in offline mode (LOCAL_MODE).
 * Same rules as the server (utils/task-rules.ts) and the same Task shape as the API,
 * so the task screens don't care where tasks live.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { normalizeCategory } from '@/features/categories';
import { defaultRecords, migrateCategoryId } from '@/features/category-tree';
import type { Task } from '@/store/tasks-store';
import { firstRuleError, validateTaskInput, type TaskRuleErrors } from '@/utils/task-rules';

type Row = {
  id: string;
  lead_minutes?: number | null;
  at_time?: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  due_date: string | null;
  start_time: string | null;
  duration: string | null;
  deadline: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Thrown for invalid input; shaped like an API 400 so the screens show the same messages. */
export class TaskRuleError extends Error {
  response: { status: number; data: { message: string; errors: TaskRuleErrors } };
  constructor(errors: TaskRuleErrors) {
    const message = firstRuleError(errors);
    super(message);
    this.response = { status: 400, data: { message, errors } };
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Schema changes, in order. Each step runs once (PRAGMA user_version) inside a transaction and
 * only adds tables or rewrites values: testers' tasks are never dropped.
 */
async function migrate(database: SQLite.SQLiteDatabase) {
  const { user_version: version } = (await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version')) ?? { user_version: 0 };
  if (version < 1) {
    await database.withExclusiveTransactionAsync(async (txn) => {
      // 1.2: categories become editable, with one level of subcategories.
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL,
          icon TEXT NOT NULL,
          parent_id TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS categories_parent ON categories(parent_id);
        CREATE TABLE IF NOT EXISTS category_learning (
          word TEXT PRIMARY KEY NOT NULL,
          category_id TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS tasks_category ON tasks(category);
      `);
      for (const record of defaultRecords()) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO categories (id, name, color, icon, parent_id, sort_order, is_archived, is_default, is_pinned, created_at, updated_at)
           VALUES (?, '', ?, ?, ?, ?, 0, 1, 0, ?, ?)`,
          record.id, record.color, record.icon, record.parentId, record.sortOrder, record.createdAt, record.updatedAt,
        );
      }
      // Old fixed-list ids -> the new categories (e.g. homework -> Assignments, empty -> Other).
      const used = await txn.getAllAsync<{ category: string | null }>('SELECT DISTINCT category FROM tasks');
      for (const { category } of used) {
        const next = migrateCategoryId(category);
        if (next === category) continue;
        if (category === null) await txn.runAsync('UPDATE tasks SET category = ? WHERE category IS NULL', next);
        else await txn.runAsync('UPDATE tasks SET category = ? WHERE category = ?', next, category);
      }
      await txn.execAsync('PRAGMA user_version = 1');
    });
  }
  if (version < 2) {
    await database.withExclusiveTransactionAsync(async (txn) => {
      // 1.3: reminders per task, the notification centre, scheduled notifications and app settings.
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS task_reminders (
          task_id TEXT PRIMARY KEY NOT NULL,
          lead_minutes INTEGER,
          at_time TEXT,
          notification_id TEXT,
          overdue_notified INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_log (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          data TEXT,
          fired_at TEXT NOT NULL,
          read_at TEXT
        );
        CREATE INDEX IF NOT EXISTS notification_log_fired ON notification_log(fired_at);
        CREATE TABLE IF NOT EXISTS planned_notifications (
          key TEXT PRIMARY KEY NOT NULL,
          notification_id TEXT NOT NULL,
          type TEXT NOT NULL,
          fire_at TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          data TEXT
        );
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      await txn.execAsync('PRAGMA user_version = 2');
    });
  }
}

/** The phone's database (tasks, categories), opened and migrated once. */
export function tasksDb() {
  return db();
}

function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('ordina-tasks.db');
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS tasks (
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
        );
      `);
      await migrate(database);
      return database;
    })();
    // If opening fails, try again on the next call instead of failing forever.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function toTask(row: Row): Task {
  const status = row.status === 'completed' ? 'completed' : row.status === 'in_progress' ? 'in_progress' : 'todo';
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    status,
    priority: (row.priority as Task['priority']) || 'medium',
    category: normalizeCategory(row.category),
    dueDate: row.due_date ?? undefined,
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
    deadline: row.deadline ?? undefined,
    recurrence: 'none',
    reminder: row.lead_minutes !== null && row.lead_minutes !== undefined,
    reminderLead: row.lead_minutes ?? null,
    reminderTime: row.at_time ?? null,
    completed: status === 'completed',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLocalTasks(): Promise<Task[]> {
  const rows = await (await db()).getAllAsync<Row>(
    `SELECT t.*, r.lead_minutes, r.at_time FROM tasks t LEFT JOIN task_reminders r ON r.task_id = t.id
     ORDER BY t.due_date IS NULL, t.due_date, t.start_time IS NULL, t.start_time, t.created_at`,
  );
  return rows.map(toTask);
}

async function getRow(id: string) {
  return (await db()).getFirstAsync<Row>(
    'SELECT t.*, r.lead_minutes, r.at_time FROM tasks t LEFT JOIN task_reminders r ON r.task_id = t.id WHERE t.id = ?',
    id,
  );
}

type TaskInput = Record<string, unknown>;

function statusFrom(value: ReturnType<typeof validateTaskInput>['value'], existing?: Row) {
  if (value.completed === true) return 'completed';
  if (value.completed === false && (value.status ?? existing?.status) === 'completed') return 'pending';
  return value.status ?? existing?.status ?? 'pending';
}

export async function createLocalTask(input: TaskInput): Promise<Task> {
  const { value, errors } = validateTaskInput(input);
  if (Object.keys(errors).length) throw new TaskRuleError(errors);
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const status = statusFrom(value);
  await (await db()).runAsync(
    `INSERT INTO tasks (id, title, description, status, priority, category, due_date, start_time, duration, deadline, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    value.title!,
    value.description ?? null,
    status,
    value.priority ?? 'medium',
    value.category ?? null,
    value.dueDate ?? null,
    value.startTime ?? null,
    value.duration ?? null,
    value.deadline ?? null,
    status === 'completed' ? now : null,
    now,
    now,
  );
  return toTask((await getRow(id))!);
}

export async function updateLocalTask(id: string, input: TaskInput): Promise<Task> {
  const existing = await getRow(id);
  if (!existing) throw Object.assign(new Error('Task not found.'), { response: { status: 404, data: { message: 'Task not found.' } } });
  const { value, errors } = validateTaskInput(input, { partial: true });
  if (Object.keys(errors).length) throw new TaskRuleError(errors);
  const status = statusFrom(value, existing);
  const now = new Date().toISOString();
  const pick = <T,>(next: T | undefined, current: T) => (next === undefined ? current : next);
  await (await db()).runAsync(
    `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, category = ?, due_date = ?, start_time = ?,
       duration = ?, deadline = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    pick(value.title, existing.title),
    pick(value.description, existing.description),
    status,
    pick(value.priority, existing.priority as 'low' | 'medium' | 'high'),
    pick(value.category, existing.category),
    pick(value.dueDate, existing.due_date),
    pick(value.startTime, existing.start_time),
    pick(value.duration, existing.duration),
    pick(value.deadline, existing.deadline),
    // Editing a completed task keeps when it was completed.
    status === 'completed' ? existing.completed_at ?? now : null,
    now,
    id,
  );
  return toTask((await getRow(id))!);
}

export async function setLocalTaskCompleted(id: string, completed: boolean) {
  await updateLocalTask(id, { completed });
}

export async function deleteLocalTask(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM tasks WHERE id = ?', id);
  await database.runAsync('DELETE FROM task_reminders WHERE task_id = ?', id);
}

/**
 * A task's reminder: minutes before its start (0 = at start), or for an Anytime task a time of
 * day. `null` lead turns the reminder off. Changing it resets the "overdue nudge sent" mark.
 */
export async function setTaskReminder(taskId: string, leadMinutes: number | null, atTime: string | null = null) {
  const database = await db();
  if (leadMinutes === null) {
    await database.runAsync('DELETE FROM task_reminders WHERE task_id = ?', taskId);
    return;
  }
  await database.runAsync(
    `INSERT INTO task_reminders (task_id, lead_minutes, at_time, overdue_notified, updated_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(task_id) DO UPDATE SET lead_minutes = excluded.lead_minutes, at_time = excluded.at_time, overdue_notified = 0, updated_at = excluded.updated_at`,
    taskId,
    Math.max(0, Math.round(leadMinutes)),
    atTime,
    new Date().toISOString(),
  );
}

/** The scheduled notification ids, stored with each task (read by tests and support). */
export async function saveReminderNotificationIds(ids: Record<string, string | null>) {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync('UPDATE task_reminders SET notification_id = NULL');
    for (const [taskId, notificationId] of Object.entries(ids)) {
      await database.runAsync('UPDATE task_reminders SET notification_id = ? WHERE task_id = ?', notificationId, taskId);
    }
  });
}

/** Tasks whose overdue nudge was already sent (it is never repeated). */
export async function overdueNotifiedIds(): Promise<Set<string>> {
  const rows = await (await db()).getAllAsync<{ task_id: string }>('SELECT task_id FROM task_reminders WHERE overdue_notified = 1');
  return new Set(rows.map((row) => row.task_id));
}

export async function markOverdueNotified(taskIds: string[]) {
  const database = await db();
  const now = new Date().toISOString();
  for (const taskId of taskIds) {
    await database.runAsync(
      `INSERT INTO task_reminders (task_id, lead_minutes, at_time, overdue_notified, updated_at) VALUES (?, NULL, NULL, 1, ?)
       ON CONFLICT(task_id) DO UPDATE SET overdue_notified = 1`,
      taskId,
      now,
    );
  }
}

/** Small settings and state shared with the background notification task (no React needed). */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setMeta(key: string, value: unknown) {
  await (await db()).runAsync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

/**
 * Saves a reviewed AI plan exactly once per plan id: a double tap or retry returns the tasks
 * created the first time instead of adding them again. All tasks are validated first, and the
 * whole plan is written in one transaction.
 */
export async function confirmLocalPlan(planId: string, tasks: TaskInput[]): Promise<{ created: Task[]; replayed?: boolean }> {
  if (!tasks.length) throw new TaskRuleError({ title: 'Choose at least one task to add.' });
  const validated = tasks.map((task, index) => {
    const { value, errors } = validateTaskInput(task);
    if (!value.dueDate && !errors.dueDate) errors.dueDate = 'Please choose a date.';
    if (Object.keys(errors).length) {
      const err = new TaskRuleError(errors);
      err.message = `Task ${index + 1}: ${err.message}`;
      err.response.data.message = err.message;
      throw err;
    }
    return value;
  });

  const database = await db();
  let ids: string[] = [];
  let replayed = false;
  await database.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ task_ids: string }>('SELECT task_ids FROM plan_confirmations WHERE plan_id = ?', planId);
    if (existing) {
      ids = JSON.parse(existing.task_ids);
      replayed = true;
      return;
    }
    const now = new Date().toISOString();
    for (const value of validated) {
      const id = Crypto.randomUUID();
      ids.push(id);
      await txn.runAsync(
        `INSERT INTO tasks (id, title, description, status, priority, category, due_date, start_time, duration, deadline, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        id,
        value.title!,
        value.description ?? null,
        value.priority ?? 'medium',
        value.category ?? null,
        value.dueDate!,
        value.startTime ?? null,
        value.duration ?? null,
        value.deadline ?? null,
        now,
        now,
      );
    }
    await txn.runAsync('INSERT INTO plan_confirmations (plan_id, task_ids, created_at) VALUES (?, ?, ?)', planId, JSON.stringify(ids), now);
  });

  const placeholders = ids.map(() => '?').join(',');
  const rows = ids.length ? await database.getAllAsync<Row>(`SELECT * FROM tasks WHERE id IN (${placeholders})`, ...ids) : [];
  return { created: rows.map(toTask), ...(replayed ? { replayed: true } : {}) };
}

/** How many tasks are stored in the phone's database (Settings shows it). */
export async function countLocalTasks() {
  const row = await (await db()).getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tasks');
  return Number(row?.n ?? 0);
}

/** Removes every task and plan record on this phone. */
export async function deleteAllLocalData() {
  await (await db()).execAsync('DELETE FROM tasks; DELETE FROM plan_confirmations; DELETE FROM task_reminders;');
}
