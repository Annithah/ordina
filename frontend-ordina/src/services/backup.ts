/**
 * Backup without an account: one JSON file (tasks, reminders, categories, what ORDINA learned,
 * notification settings, chat history), shared through the phone's share menu (Drive,
 * WhatsApp, email). Import checks the whole file first, then replaces or merges in one
 * transaction (latest change wins, no duplicates) and re-plans every reminder.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { BACKUP_APP, BACKUP_VERSION, backupFileName, mergeRows, parseBackup, type BackupError, type BackupFile } from '@/features/backup-format';
import { translate } from '@/i18n/translations';
import { chatDb } from '@/services/chat-history';
import { getMeta, setMeta, tasksDb } from '@/services/local-tasks';
import { SETTINGS_KEY, patchState, requestReschedule } from '@/services/notifications';

type RowRecord = Record<string, unknown>;

const TABLES = {
  tasks: { table: 'tasks', key: 'id', db: 'tasks' },
  reminders: { table: 'task_reminders', key: 'task_id', db: 'tasks' },
  categories: { table: 'categories', key: 'id', db: 'tasks' },
  categoryLearning: { table: 'category_learning', key: 'word', db: 'tasks' },
  conversations: { table: 'conversations', key: 'id', db: 'chats' },
  messages: { table: 'chat_messages', key: 'id', db: 'chats' },
} as const;

type Part = keyof typeof TABLES;

async function databaseFor(which: 'tasks' | 'chats') {
  return which === 'tasks' ? tasksDb() : chatDb();
}

export async function exportBackup(): Promise<{ file: string; tasks: number }> {
  const backup: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: [],
    reminders: [],
    categories: [],
    categoryLearning: [],
    settings: await getMeta<Record<string, unknown>>(SETTINGS_KEY, {}),
    conversations: [],
    messages: [],
  };
  for (const [part, info] of Object.entries(TABLES) as [Part, (typeof TABLES)[Part]][]) {
    const database = await databaseFor(info.db);
    backup[part] = await database.getAllAsync<RowRecord>(`SELECT * FROM ${info.table}`);
  }
  const file = new File(Paths.cache, backupFileName());
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: translate('backup.shareTitle'), UTI: 'public.json' });
  }
  await patchState({ lastBackupAt: new Date().toISOString(), backupSnoozedUntil: null });
  requestReschedule('backup');
  return { file: file.uri, tasks: backup.tasks.length };
}

/** Lets the user pick a backup file and checks it. Nothing is changed yet. */
export async function pickBackup(): Promise<{ ok: true; backup: BackupFile; counts: Record<string, number> } | { ok: false; error: BackupError | 'cancelled' }> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return { ok: false, error: 'cancelled' };
  try {
    return parseBackup(await new File(picked.assets[0].uri).text());
  } catch {
    return { ok: false, error: 'notJson' };
  }
}

/** Only columns that exist in this version of the table (older or newer files stay safe). */
async function columnsOf(database: SQLiteDatabase, table: string) {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

async function writeRows(database: SQLiteDatabase, table: string, rows: RowRecord[]) {
  if (!rows.length) return;
  const columns = await columnsOf(database, table);
  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => columns.has(key));
    if (!keys.length) continue;
    await database.runAsync(
      `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...keys.map((key) => {
        const value = row[key];
        return value === undefined ? null : typeof value === 'object' && value !== null ? JSON.stringify(value) : value as string | number | null;
      }),
    );
  }
}

/** Replace: the phone gets exactly the backup. Merge: newest version of each item, no duplicates. */
export async function applyBackup(backup: BackupFile, mode: 'replace' | 'merge') {
  for (const which of ['tasks', 'chats'] as const) {
    const database = await databaseFor(which);
    await database.withExclusiveTransactionAsync(async (txn) => {
      for (const [part, info] of Object.entries(TABLES) as [Part, (typeof TABLES)[Part]][]) {
        if (info.db !== which) continue;
        const incoming = backup[part] ?? [];
        if (mode === 'replace') {
          await txn.runAsync(`DELETE FROM ${info.table}`);
          await writeRows(txn, info.table, incoming);
        } else {
          const existing = await txn.getAllAsync<RowRecord>(`SELECT * FROM ${info.table}`);
          await writeRows(txn, info.table, mergeRows(existing, incoming, info.key));
        }
      }
    });
  }
  if (mode === 'replace' && Object.keys(backup.settings).length) await setMeta(SETTINGS_KEY, backup.settings);
  // Reload everything and re-plan every reminder on this phone.
  const [{ useTasksStore }, { useCategoriesStore }, { useNotificationSettings }] = await Promise.all([
    import('@/store/tasks-store'),
    import('@/store/categories-store'),
    import('@/store/notification-settings-store'),
  ]);
  await Promise.all([useTasksStore.getState().loadTasks(), useCategoriesStore.getState().load(), useNotificationSettings.getState().load()]);
  requestReschedule('restore');
}
