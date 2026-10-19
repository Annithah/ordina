/**
 * The phone database (expo-sqlite): tasks, categories and settings. It is the main copy of the
 * user's data and works fully offline; server sync (services/sync.ts) copies changes both ways.
 *
 * - Schema changes live in logic/migrations.ts (add-only, versioned with PRAGMA user_version).
 * - Every change sets `updated_at` and `dirty = 1` so sync knows what to send.
 * - Deleting a task or category is a soft delete (`deleted_at`), so the deletion syncs too.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { CATEGORY_COLORS, CATEGORY_ICONS, OTHER_CATEGORY_ID, fallbackCategoryId, type Category, type CategoryIcon } from '@/logic/categories';
import { filterSql, matchesStatus, type TaskFilters, type WeekStart } from '@/logic/filters';
import { migrations } from '@/logic/migrations';
import { normalizeReminder, type ReminderOption } from '@/logic/reminders';
import type { Task } from '@/store/tasks-store';
import { firstRuleError, validateTaskInput, type TaskRuleErrors } from '@/utils/task-rules';

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  category_id: string | null;
  due_date: string | null;
  start_time: string | null;
  duration: string | null;
  deadline: string | null;
  reminder: string;
  reminder_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: number;
};

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  default_key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: number;
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

const notFound = (what: string) => Object.assign(new Error(`${what} not found.`), { response: { status: 404, data: { message: `${what} not found.` } } });

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(database: SQLite.SQLiteDatabase) {
  const steps = migrations(new Date().toISOString());
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < steps.length; version += 1) {
    // Each step and its version bump commit together: a failed step leaves the phone on the
    // previous version with its data untouched, and is retried on the next start.
    await database.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(steps[version]);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('ordina-tasks.db');
      await database.execAsync('PRAGMA journal_mode = WAL;');
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

export function toTask(row: TaskRow): Task {
  const status = row.status === 'completed' ? 'completed' : row.status === 'in_progress' ? 'in_progress' : 'todo';
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    status,
    priority: row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    categoryId: row.category_id || OTHER_CATEGORY_ID,
    dueDate: row.due_date ?? undefined,
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
    deadline: row.deadline ?? undefined,
    reminder: (row.reminder as ReminderOption) || 'none',
    reminderAt: row.reminder_at,
    completed: status === 'completed',
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: (CATEGORY_ICONS as readonly string[]).includes(row.icon) ? (row.icon as CategoryIcon) : 'pricetag-outline',
    position: row.position,
    defaultKey: row.default_key || null,
  };
}

const ORDER = 'ORDER BY due_date IS NULL, due_date, start_time IS NULL, start_time, created_at';

export async function listLocalTasks(): Promise<Task[]> {
  const rows = await (await db()).getAllAsync<TaskRow>(`SELECT * FROM tasks WHERE deleted_at IS NULL ${ORDER}`);
  return rows.map(toTask);
}

/** Home page search and filters, done in SQLite (see logic/filters.ts). */
export async function queryLocalTasks(filters: TaskFilters, weekStart: WeekStart, now = new Date()): Promise<Task[]> {
  const { where, params } = filterSql(filters, now, weekStart);
  const rows = await (await db()).getAllAsync<TaskRow>(`SELECT * FROM tasks WHERE ${where} ${ORDER}`, params);
  return rows.map(toTask).filter((task) => matchesStatus(task, filters.status, now));
}

export async function getLocalTask(id: string) {
  const row = await (await db()).getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', id);
  return row ? toTask(row) : null;
}

async function getRow(id: string) {
  return (await db()).getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', id);
}

type TaskInput = Record<string, unknown>;

function statusFrom(value: ReturnType<typeof validateTaskInput>['value'], existing?: TaskRow) {
  if (value.completed === true) return 'completed';
  if (value.completed === false && (value.status ?? existing?.status) === 'completed') return 'pending';
  return value.status ?? existing?.status ?? 'pending';
}

async function existingCategoryId(id: string | undefined) {
  if (!id) return OTHER_CATEGORY_ID;
  const row = await (await db()).getFirstAsync<{ id: string }>('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', id);
  if (row) return id;
  const other = await (await db()).getFirstAsync<{ id: string }>('SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY id = ? DESC, position LIMIT 1', OTHER_CATEGORY_ID);
  return other?.id ?? OTHER_CATEGORY_ID;
}

export async function createLocalTask(input: TaskInput): Promise<Task> {
  const { value, errors } = validateTaskInput(input);
  if (Object.keys(errors).length) throw new TaskRuleError(errors);
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const status = statusFrom(value);
  const reminder = normalizeReminder({ ...value, completed: false });
  await (await db()).runAsync(
    `INSERT INTO tasks (id, title, description, status, priority, category_id, due_date, start_time, duration, deadline,
       reminder, reminder_at, completed_at, created_at, updated_at, deleted_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
    id,
    value.title!,
    value.description ?? null,
    status,
    value.priority ?? 'medium',
    await existingCategoryId(value.categoryId),
    value.dueDate ?? null,
    value.startTime ?? null,
    value.duration ?? null,
    value.deadline ?? null,
    reminder.reminder,
    reminder.reminderAt,
    status === 'completed' ? now : null,
    now,
    now,
  );
  return toTask((await getRow(id))!);
}

export async function updateLocalTask(id: string, input: TaskInput): Promise<Task> {
  const existing = await getRow(id);
  if (!existing) throw notFound('Task');
  const { value, errors } = validateTaskInput(input, { partial: true });
  if (Object.keys(errors).length) throw new TaskRuleError(errors);
  const status = statusFrom(value, existing);
  const now = new Date().toISOString();
  const pick = <T,>(next: T | undefined, current: T) => (next === undefined ? current : next);
  const startTime = pick(value.startTime, existing.start_time);
  const reminder = normalizeReminder({
    startTime,
    completed: false,
    reminder: pick(value.reminder, existing.reminder as ReminderOption),
    reminderAt: pick(value.reminderAt, existing.reminder_at),
  });
  await (await db()).runAsync(
    `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, category_id = ?, due_date = ?, start_time = ?,
       duration = ?, deadline = ?, reminder = ?, reminder_at = ?, completed_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`,
    pick(value.title, existing.title),
    pick(value.description, existing.description),
    status,
    pick(value.priority, existing.priority as 'low' | 'medium' | 'high'),
    value.categoryId === undefined ? existing.category_id : await existingCategoryId(value.categoryId),
    pick(value.dueDate, existing.due_date),
    startTime,
    pick(value.duration, existing.duration),
    pick(value.deadline, existing.deadline),
    reminder.reminder,
    reminder.reminderAt,
    // Editing a completed task keeps when it was completed.
    status === 'completed' ? existing.completed_at ?? now : null,
    now,
    id,
  );
  return toTask((await getRow(id))!);
}

export async function setLocalTaskCompleted(id: string, completed: boolean) {
  return updateLocalTask(id, { completed });
}

/** Soft delete: the row stays (hidden) so the deletion reaches the server and other phones. */
export async function deleteLocalTask(id: string) {
  const now = new Date().toISOString();
  await (await db()).runAsync('UPDATE tasks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', now, now, id);
}

/**
 * Saves a reviewed plan exactly once per plan id: a double tap or retry returns the tasks
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
  const categoryIds = await Promise.all(validated.map((value) => existingCategoryId(value.categoryId)));

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
    for (const [index, value] of validated.entries()) {
      const id = Crypto.randomUUID();
      ids.push(id);
      const reminder = normalizeReminder({ ...value, completed: false });
      await txn.runAsync(
        `INSERT INTO tasks (id, title, description, status, priority, category_id, due_date, start_time, duration, deadline,
           reminder, reminder_at, completed_at, created_at, updated_at, deleted_at, dirty)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1)`,
        id,
        value.title!,
        value.description ?? null,
        value.priority ?? 'medium',
        categoryIds[index],
        value.dueDate!,
        value.startTime ?? null,
        value.duration ?? null,
        value.deadline ?? null,
        reminder.reminder,
        reminder.reminderAt,
        now,
        now,
      );
    }
    await txn.runAsync('INSERT INTO plan_confirmations (plan_id, task_ids, created_at) VALUES (?, ?, ?)', planId, JSON.stringify(ids), now);
  });

  const placeholders = ids.map(() => '?').join(',');
  const rows = ids.length ? await database.getAllAsync<TaskRow>(`SELECT * FROM tasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids) : [];
  return { created: rows.map(toTask), ...(replayed ? { replayed: true } : {}) };
}

/** Removes every task on this phone (soft delete, so a signed-in user's other phones follow). */
export async function deleteAllLocalData() {
  const now = new Date().toISOString();
  await (await db()).runAsync('UPDATE tasks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL', now, now);
  await (await db()).execAsync('DELETE FROM plan_confirmations;');
}

// ---------------------------------------------------------------- categories

export async function listCategories(): Promise<Category[]> {
  const rows = await (await db()).getAllAsync<CategoryRow>('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY position, created_at');
  return rows.map(toCategory);
}

/** Task counts per category (not deleted), for "Study (3)" headers and the delete dialog. */
export async function categoryTaskCounts(): Promise<Record<string, number>> {
  const rows = await (await db()).getAllAsync<{ category_id: string; n: number }>(
    'SELECT category_id, COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL GROUP BY category_id',
  );
  return Object.fromEntries(rows.map((row) => [row.category_id, row.n]));
}

export async function createCategory(input: { name: string; color: string; icon: CategoryIcon }): Promise<Category> {
  const database = await db();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const last = await database.getFirstAsync<{ p: number | null }>('SELECT MAX(position) AS p FROM categories WHERE deleted_at IS NULL');
  await database.runAsync(
    `INSERT INTO categories (id, name, color, icon, position, default_key, created_at, updated_at, deleted_at, dirty)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, NULL, 1)`,
    id,
    input.name.trim().replace(/\s+/g, ' '),
    (CATEGORY_COLORS as readonly string[]).includes(input.color) ? input.color : CATEGORY_COLORS[0],
    input.icon,
    (last?.p ?? -1) + 1,
    now,
    now,
  );
  return (await listCategories()).find((category) => category.id === id)!;
}

export async function updateCategory(id: string, input: { name: string; color: string; icon: CategoryIcon }) {
  const now = new Date().toISOString();
  const result = await (await db()).runAsync(
    'UPDATE categories SET name = ?, color = ?, icon = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL',
    input.name.trim().replace(/\s+/g, ' '),
    input.color,
    input.icon,
    now,
    id,
  );
  if (!result.changes) throw notFound('Category');
}

/** Saves a new order (ids first to last). */
export async function reorderCategories(ids: string[]) {
  const database = await db();
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const [position, id] of ids.entries()) {
      await txn.runAsync('UPDATE categories SET position = ?, updated_at = ?, dirty = 1 WHERE id = ? AND position != ?', position, now, id, position);
    }
  });
}

/**
 * Deletes a category after moving its tasks to `moveTo` (or "Other"). Tasks are never deleted.
 * The last category cannot be deleted.
 */
export async function deleteCategory(id: string, moveTo?: string | null) {
  const database = await db();
  const categories = await listCategories();
  const target = fallbackCategoryId(categories, id, moveTo);
  if (!target) throw Object.assign(new Error('Keep at least one category.'), { response: { status: 400, data: { message: 'Keep at least one category.' } } });
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE tasks SET category_id = ?, updated_at = ?, dirty = 1 WHERE category_id = ?', target, now, id);
    await txn.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', now, now, id);
  });
  return target;
}

// ---------------------------------------------------------------- settings

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeSetting(key: string, value: unknown) {
  await (await db()).runAsync(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export async function readAllSettings(): Promise<Record<string, unknown>> {
  const rows = await (await db()).getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      // A broken value is skipped; the app falls back to its default.
    }
  }
  return result;
}
