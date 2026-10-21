/**
 * ORDINA backup file: one JSON file with tasks, reminders, categories, what ORDINA learned,
 * notification settings and chat history. Validation and merging are pure (unit tested).
 */

export const BACKUP_APP = 'ORDINA';
export const BACKUP_VERSION = 1;

type RowRecord = Record<string, unknown>;

export type BackupFile = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  tasks: RowRecord[];
  reminders: RowRecord[];
  categories: RowRecord[];
  categoryLearning: RowRecord[];
  settings: Record<string, unknown>;
  conversations: RowRecord[];
  messages: RowRecord[];
};

export type BackupError = 'notJson' | 'notOrdina' | 'newerVersion' | 'invalid';

const REQUIRED: Record<'tasks' | 'reminders' | 'categories' | 'categoryLearning' | 'conversations' | 'messages', string[]> = {
  tasks: ['id', 'title', 'status', 'created_at', 'updated_at'],
  reminders: ['task_id'],
  categories: ['id', 'color', 'icon', 'created_at', 'updated_at'],
  categoryLearning: ['word', 'category_id'],
  conversations: ['id', 'title', 'created_at', 'updated_at'],
  messages: ['id', 'conversation_id', 'role', 'content', 'created_at'],
};

const isText = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length < 100_000;

/** Parses and checks a backup file. Nothing is written until the whole file is valid. */
export function parseBackup(text: string): { ok: true; backup: BackupFile; counts: Record<string, number> } | { ok: false; error: BackupError } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!json || typeof json !== 'object' || (json as RowRecord).app !== BACKUP_APP) return { ok: false, error: 'notOrdina' };
  const file = json as RowRecord;
  if (typeof file.version !== 'number' || file.version < 1) return { ok: false, error: 'invalid' };
  if (file.version > BACKUP_VERSION) return { ok: false, error: 'newerVersion' };
  const backup = { ...file } as unknown as BackupFile;
  for (const [table, fields] of Object.entries(REQUIRED) as [keyof typeof REQUIRED, string[]][]) {
    const rows = file[table] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: 'invalid' };
    for (const row of rows) {
      if (!row || typeof row !== 'object') return { ok: false, error: 'invalid' };
      if (!fields.every((field) => isText((row as RowRecord)[field]))) return { ok: false, error: 'invalid' };
    }
    backup[table] = rows as RowRecord[];
  }
  // Every message belongs to a conversation in the file.
  const conversationIds = new Set(backup.conversations.map((row) => row.id));
  if (backup.messages.some((row) => !conversationIds.has(row.conversation_id))) return { ok: false, error: 'invalid' };
  backup.settings = file.settings && typeof file.settings === 'object' ? file.settings as Record<string, unknown> : {};
  return {
    ok: true,
    backup,
    counts: { tasks: backup.tasks.length, categories: backup.categories.length, conversations: backup.conversations.length },
  };
}

/**
 * Merge: rows from the file are added; a row that exists on both sides keeps the newest
 * version (latest updated_at wins). Never duplicates.
 */
export function mergeRows(existing: RowRecord[], incoming: RowRecord[], key = 'id'): RowRecord[] {
  const byKey = new Map(existing.map((row) => [String(row[key]), row]));
  const changes: RowRecord[] = [];
  for (const row of incoming) {
    const id = String(row[key]);
    const current = byKey.get(id);
    if (!current || String(row.updated_at ?? '') > String(current.updated_at ?? '')) {
      changes.push(row);
      byKey.set(id, row);
    }
  }
  return changes;
}

export function backupFileName(now = new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `ordina-backup-${day}.json`;
}
