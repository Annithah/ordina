/**
 * Backup file format and import rules. No app imports, so the unit tests run with plain Node.
 *
 * File: JSON { app: "ordina", format: 1, exportedAt, tasks, categories, settings }.
 * Import:
 * - The whole file is checked first; a broken file changes nothing.
 * - Records are matched by id, so importing the same file twice never creates duplicates.
 * - "merge": keeps what is on the phone and adds what is missing; when the same task or
 *   category exists in both, the most recently changed copy wins. Phone settings are kept.
 * - "replace": the phone ends up with exactly what is in the file (tasks and categories not in
 *   the file are removed), and settings from the file replace the phone's.
 */
import { CATEGORY_NAME_MAX, OTHER_CATEGORY_ID } from './categories.ts';

export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_TASKS = 50_000;
export const MAX_BACKUP_CATEGORIES = 500;

export type BackupTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
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
};

export type BackupCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  default_key: string;
  created_at: string;
  updated_at: string;
};

export type BackupFile = {
  app: 'ordina';
  format: number;
  exportedAt: string;
  tasks: BackupTask[];
  categories: BackupCategory[];
  settings: Record<string, unknown>;
};

/** Settings that only make sense on this phone are never exported or imported. */
export const DEVICE_ONLY_SETTINGS = ['lastExportAt', 'syncCursor', 'lastSyncAt'];

export function buildBackup(tasks: BackupTask[], categories: BackupCategory[], settings: Record<string, unknown>, now = new Date()): BackupFile {
  const portable = Object.fromEntries(Object.entries(settings).filter(([key]) => !DEVICE_ONLY_SETTINGS.includes(key)));
  return { app: 'ordina', format: BACKUP_FORMAT, exportedAt: now.toISOString(), tasks, categories, settings: portable };
}

export function backupFileName(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ORDINA-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type BackupProblem = 'notJson' | 'notOrdina' | 'newerFormat' | 'invalid' | 'tooLarge';

export class BackupError extends Error {
  problem: BackupProblem;
  constructor(problem: BackupProblem, detail?: string) {
    super(detail ? `${problem}: ${detail}` : problem);
    this.problem = problem;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[\w-]{1,64}$/;
const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const optional = (v: unknown, test: (s: string) => boolean) => v === null || v === undefined || (typeof v === 'string' && test(v));
const str = (v: unknown) => (typeof v === 'string' ? v : null);

function checkTask(raw: unknown, index: number): BackupTask {
  const fail = (field: string) => {
    throw new BackupError('invalid', `task ${index + 1} ${field}`);
  };
  if (!raw || typeof raw !== 'object') fail('is not an object');
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) fail('id');
  if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 200) fail('title');
  if (!optional(t.description, (s) => s.length <= 2000)) fail('description');
  if (!['pending', 'in_progress', 'completed'].includes(String(t.status))) fail('status');
  if (!['low', 'medium', 'high'].includes(String(t.priority))) fail('priority');
  if (!optional(t.category_id, (s) => ID_RE.test(s))) fail('category');
  if (!optional(t.due_date, (s) => DATE_RE.test(s))) fail('date');
  if (!optional(t.start_time, (s) => TIME_RE.test(s))) fail('time');
  if (!optional(t.duration, (s) => /^\d+h \d+m$/.test(s))) fail('duration');
  if (!optional(t.deadline, (s) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s))) fail('deadline');
  if (!optional(t.reminder_at, (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))) fail('reminder time');
  if (!optional(t.completed_at, (s) => isIso(s))) fail('completed time');
  if (!isIso(t.created_at) || !isIso(t.updated_at)) fail('timestamps');
  const reminder = ['none', 'start', '5', '15', '30', '60', '1440', 'custom'].includes(String(t.reminder)) ? String(t.reminder) : 'none';
  return {
    id: t.id as string,
    title: (t.title as string).trim(),
    description: str(t.description),
    status: t.status as string,
    priority: t.priority as string,
    category_id: str(t.category_id),
    due_date: str(t.due_date),
    start_time: str(t.start_time),
    duration: str(t.duration),
    deadline: str(t.deadline),
    reminder,
    reminder_at: str(t.reminder_at),
    completed_at: str(t.completed_at),
    created_at: t.created_at as string,
    updated_at: t.updated_at as string,
  };
}

function checkCategory(raw: unknown, index: number): BackupCategory {
  const fail = (field: string) => {
    throw new BackupError('invalid', `category ${index + 1} ${field}`);
  };
  if (!raw || typeof raw !== 'object') fail('is not an object');
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || !ID_RE.test(c.id)) fail('id');
  if (typeof c.name !== 'string' || c.name.length > CATEGORY_NAME_MAX) fail('name');
  if (typeof c.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(c.color)) fail('color');
  if (typeof c.icon !== 'string' || c.icon.length > 40) fail('icon');
  if (typeof c.position !== 'number' || !Number.isFinite(c.position)) fail('position');
  if (typeof c.default_key !== 'string') fail('default');
  if (!c.name && !c.default_key) fail('name');
  if (!isIso(c.created_at) || !isIso(c.updated_at)) fail('timestamps');
  return {
    id: c.id as string,
    name: c.name as string,
    color: c.color as string,
    icon: c.icon as string,
    position: c.position as number,
    default_key: c.default_key as string,
    created_at: c.created_at as string,
    updated_at: c.updated_at as string,
  };
}

/** Reads and checks a backup file. Throws BackupError; never returns a half-valid file. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).app !== 'ordina') throw new BackupError('notOrdina');
  const file = raw as Record<string, unknown>;
  if (typeof file.format !== 'number' || file.format < 1) throw new BackupError('invalid', 'format');
  if (file.format > BACKUP_FORMAT) throw new BackupError('newerFormat');
  if (!Array.isArray(file.tasks) || !Array.isArray(file.categories)) throw new BackupError('invalid', 'lists');
  if (file.tasks.length > MAX_BACKUP_TASKS || file.categories.length > MAX_BACKUP_CATEGORIES) throw new BackupError('tooLarge');
  const tasks = file.tasks.map(checkTask);
  const categories = file.categories.map(checkCategory);
  if (new Set(tasks.map((t) => t.id)).size !== tasks.length || new Set(categories.map((c) => c.id)).size !== categories.length) {
    throw new BackupError('invalid', 'duplicate ids');
  }
  const settings = file.settings && typeof file.settings === 'object' && !Array.isArray(file.settings) ? (file.settings as Record<string, unknown>) : {};
  return {
    app: 'ordina',
    format: file.format,
    exportedAt: isIso(file.exportedAt) ? (file.exportedAt as string) : new Date(0).toISOString(),
    tasks,
    categories,
    settings: Object.fromEntries(Object.entries(settings).filter(([key]) => !DEVICE_ONLY_SETTINGS.includes(key))),
  };
}

export type ImportMode = 'merge' | 'replace';

export type ImportPlan = {
  /** Rows to insert or overwrite. */
  tasks: BackupTask[];
  categories: BackupCategory[];
  /** Phone records to remove (soft delete), only in "replace". */
  removeTaskIds: string[];
  removeCategoryIds: string[];
  settings: Record<string, unknown>;
  counts: { added: number; updated: number; unchanged: number; removed: number };
};

/**
 * What to write for an import. `local` holds the phone's live (not deleted) records. Tasks
 * whose category does not exist afterwards move to "Other".
 */
export function planImport(
  local: { tasks: Pick<BackupTask, 'id' | 'updated_at'>[]; categories: Pick<BackupCategory, 'id' | 'updated_at'>[] },
  backup: BackupFile,
  mode: ImportMode,
): ImportPlan {
  const localTasks = new Map(local.tasks.map((t) => [t.id, t.updated_at]));
  const localCategories = new Map(local.categories.map((c) => [c.id, c.updated_at]));
  const counts = { added: 0, updated: 0, unchanged: 0, removed: 0 };

  const pick = <T extends { id: string; updated_at: string }>(rows: T[], existing: Map<string, string>, countIt: boolean) => rows.filter((row) => {
    const mine = existing.get(row.id);
    let take: boolean;
    if (mine === undefined) take = true;
    else if (mode === 'replace') take = Date.parse(mine) !== Date.parse(row.updated_at);
    else take = Date.parse(row.updated_at) > Date.parse(mine);
    if (countIt) {
      if (mine === undefined) counts.added += 1;
      else if (take) counts.updated += 1;
      else counts.unchanged += 1;
    }
    return take;
  });

  const categories = pick(backup.categories, localCategories, false);
  const finalCategoryIds = new Set(mode === 'replace' ? backup.categories.map((c) => c.id) : [...localCategories.keys(), ...backup.categories.map((c) => c.id)]);
  const fallback = finalCategoryIds.has(OTHER_CATEGORY_ID) ? OTHER_CATEGORY_ID : [...finalCategoryIds][0] ?? OTHER_CATEGORY_ID;
  const tasks = pick(backup.tasks, localTasks, true).map((task) => (
    task.category_id && finalCategoryIds.has(task.category_id) ? task : { ...task, category_id: fallback }
  ));

  const backupTaskIds = new Set(backup.tasks.map((t) => t.id));
  const backupCategoryIds = new Set(backup.categories.map((c) => c.id));
  const removeTaskIds = mode === 'replace' ? [...localTasks.keys()].filter((id) => !backupTaskIds.has(id)) : [];
  const removeCategoryIds = mode === 'replace' && backup.categories.length ? [...localCategories.keys()].filter((id) => !backupCategoryIds.has(id)) : [];
  counts.removed = removeTaskIds.length;

  return { tasks, categories, removeTaskIds, removeCategoryIds, settings: mode === 'replace' ? backup.settings : {}, counts };
}

/** When the next "please back up" reminder is due: lastExport (or first use) + 7 or 30 days. */
export function nextBackupReminder(lastExportAt: string | null, since: string, frequency: 'weekly' | 'monthly') {
  const base = Date.parse(lastExportAt ?? since);
  const days = frequency === 'monthly' ? 30 : 7;
  return new Date((Number.isNaN(base) ? Date.now() : base) + days * 24 * 60 * 60 * 1000);
}
