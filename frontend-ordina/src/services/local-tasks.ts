/**
 * Tasks stored on the phone (expo-sqlite), used in offline mode (LOCAL_MODE).
 * Same rules as the server (utils/task-rules.ts) and the same Task shape as the API,
 * so the task screens don't care where tasks live.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { normalizeCategory } from '@/features/categories';
import type { Task } from '@/store/tasks-store';
import { firstRuleError, validateTaskInput, type TaskRuleErrors } from '@/utils/task-rules';

type Row = {
  id: string;
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
    reminder: false,
    completed: status === 'completed',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLocalTasks(): Promise<Task[]> {
  const rows = await (await db()).getAllAsync<Row>(
    'SELECT * FROM tasks ORDER BY due_date IS NULL, due_date, start_time IS NULL, start_time, created_at',
  );
  return rows.map(toTask);
}

async function getRow(id: string) {
  return (await db()).getFirstAsync<Row>('SELECT * FROM tasks WHERE id = ?', id);
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
  await (await db()).runAsync('DELETE FROM tasks WHERE id = ?', id);
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
  await (await db()).execAsync('DELETE FROM tasks; DELETE FROM plan_confirmations;');
}
