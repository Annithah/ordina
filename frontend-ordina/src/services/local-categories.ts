/**
 * Categories stored on the phone (same SQLite database as the tasks, so moving tasks and
 * deleting a category happen in one transaction). Deleted categories are kept with
 * deleted_at set, ready for sync.
 */
import * as Crypto from 'expo-crypto';

import type { CategoryRecord, DeletePlan, MergePlan } from '@/features/category-tree';
import { tasksDb } from '@/services/local-tasks';

type Row = {
  id: string;
  name: string;
  color: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_archived: number;
  is_default: number;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function toRecord(row: Row): CategoryRecord {
  return {
    id: row.id,
    name: row.name ?? '',
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isArchived: Boolean(row.is_archived),
    isDefault: Boolean(row.is_default),
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Every category, including archived and deleted ones (the screens filter them). */
export async function listCategories(): Promise<CategoryRecord[]> {
  const rows = await (await tasksDb()).getAllAsync<Row>('SELECT * FROM categories ORDER BY parent_id IS NOT NULL, sort_order, created_at');
  return rows.map(toRecord);
}

export async function insertCategory(input: { name: string; color: string; icon: string; parentId: string | null }): Promise<string> {
  const database = await tasksDb();
  const id = Crypto.randomUUID().toLowerCase();
  const now = new Date().toISOString();
  const last = await database.getFirstAsync<{ next: number | null }>(
    'SELECT MAX(sort_order) + 1 AS next FROM categories WHERE parent_id IS ? AND deleted_at IS NULL',
    input.parentId,
  );
  await database.runAsync(
    `INSERT INTO categories (id, name, color, icon, parent_id, sort_order, is_archived, is_default, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    id, input.name.trim(), input.color, input.icon, input.parentId, last?.next ?? 0, now, now,
  );
  return id;
}

type Patch = Partial<Pick<CategoryRecord, 'name' | 'color' | 'icon' | 'isArchived' | 'isPinned'>>;

export async function patchCategory(id: string, patch: Patch) {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); values.push(patch.name.trim()); }
  if (patch.color !== undefined) { sets.push('color = ?'); values.push(patch.color); }
  if (patch.icon !== undefined) { sets.push('icon = ?'); values.push(patch.icon); }
  if (patch.isArchived !== undefined) { sets.push('is_archived = ?'); values.push(patch.isArchived ? 1 : 0); }
  if (patch.isPinned !== undefined) { sets.push('is_pinned = ?'); values.push(patch.isPinned ? 1 : 0); }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  await (await tasksDb()).runAsync(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, ...values, id);
}

export async function saveOrder(order: { id: string; sortOrder: number }[]) {
  const database = await tasksDb();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    for (const item of order) {
      await database.runAsync('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?', item.sortOrder, now, item.id);
    }
  });
}

const marks = (ids: string[]) => ids.map(() => '?').join(', ');

/** Applies a delete plan: tasks move (or are deleted, only when the user chose that), then the categories go. */
export async function applyDelete(plan: DeletePlan) {
  const database = await tasksDb();
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (txn) => {
    if (plan.moveTasksTo) {
      await txn.runAsync(`UPDATE tasks SET category = ?, updated_at = ? WHERE category IN (${marks(plan.removeIds)})`, plan.moveTasksTo, now, ...plan.removeIds);
    } else {
      await txn.runAsync(`DELETE FROM tasks WHERE category IN (${marks(plan.removeIds)})`, ...plan.removeIds);
    }
    await txn.runAsync(`UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id IN (${marks(plan.removeIds)})`, now, now, ...plan.removeIds);
  });
}

export async function applyMerge(plan: MergePlan) {
  const database = await tasksDb();
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(`UPDATE tasks SET category = ?, updated_at = ? WHERE category IN (${marks(plan.moveTaskIds)})`, plan.target, now, ...plan.moveTaskIds);
    if (plan.reparentIds.length) {
      await txn.runAsync(`UPDATE categories SET parent_id = ?, updated_at = ? WHERE id IN (${marks(plan.reparentIds)})`, plan.target, now, ...plan.reparentIds);
    }
    await txn.runAsync(`UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id IN (${marks(plan.removeIds)})`, now, now, ...plan.removeIds);
  });
}

/** Bulk action on the Tasks page: move the selected tasks to one category. */
export async function moveLocalTasks(taskIds: string[], categoryId: string) {
  if (!taskIds.length) return;
  await (await tasksDb()).runAsync(
    `UPDATE tasks SET category = ?, updated_at = ? WHERE id IN (${marks(taskIds)})`,
    categoryId, new Date().toISOString(), ...taskIds,
  );
}

/** Categories of the most recently changed tasks, newest first (the picker's "Recent"). */
export async function recentCategoryIds(): Promise<string[]> {
  const rows = await (await tasksDb()).getAllAsync<{ category: string | null }>(
    'SELECT category FROM tasks WHERE category IS NOT NULL ORDER BY updated_at DESC LIMIT 40',
  );
  return rows.map((row) => row.category!).filter(Boolean);
}

export async function loadLearned(): Promise<Record<string, string>> {
  const rows = await (await tasksDb()).getAllAsync<{ word: string; category_id: string }>('SELECT word, category_id FROM category_learning');
  return Object.fromEntries(rows.map((row) => [row.word, row.category_id]));
}

export async function saveLearned(words: Record<string, string>) {
  const entries = Object.entries(words);
  if (!entries.length) return;
  const database = await tasksDb();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    for (const [word, categoryId] of entries) {
      await database.runAsync(
        'INSERT INTO category_learning (word, category_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(word) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at',
        word, categoryId, now,
      );
    }
  });
}
