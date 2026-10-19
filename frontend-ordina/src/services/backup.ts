/**
 * Local backup file (works without an account or internet): export opens the phone's share menu
 * (save to Google Drive, send by WhatsApp or email...), import restores a file after checking it.
 * Also keeps the "Protect your tasks" reminder for people who are not signed in.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { translate } from '@/i18n';
import {
  BackupError,
  DEVICE_ONLY_SETTINGS,
  backupFileName,
  buildBackup,
  nextBackupReminder,
  parseBackup,
  planImport,
  type BackupCategory,
  type BackupFile,
  type BackupTask,
  type ImportMode,
} from '@/logic/backup';
import { notifyDataChanged } from '@/services/data-events';
import { db, readAllSettings, readSetting, writeSetting } from '@/services/local-tasks';
import { cancelScheduled, scheduleAt } from '@/services/notifications';
import { rescheduleAll } from '@/services/task-reminders';
import { getSettings, useSettingsStore } from '@/store/settings-store';
import { useTasksStore } from '@/store/tasks-store';

const TASK_COLUMNS = 'id, title, description, status, priority, category_id, due_date, start_time, duration, deadline, reminder, reminder_at, completed_at, created_at, updated_at';
const CATEGORY_COLUMNS = 'id, name, color, icon, position, default_key, created_at, updated_at';
const BACKUP_REMINDER_ID = 'backup-reminder';

async function liveRows() {
  const database = await db();
  const [tasks, categories] = await Promise.all([
    database.getAllAsync<BackupTask>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE deleted_at IS NULL ORDER BY created_at`),
    database.getAllAsync<BackupCategory>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE deleted_at IS NULL ORDER BY position`),
  ]);
  return { tasks, categories };
}

/** Creates the backup file and opens the share menu. Returns false if sharing is unavailable. */
export async function exportBackup() {
  const { tasks, categories } = await liveRows();
  const backup = buildBackup(tasks, categories, await readAllSettings());
  const file = new File(Paths.cache, backupFileName());
  file.create({ overwrite: true });
  file.write(JSON.stringify(backup, null, 1));
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: translate('backup.shareTitle'), UTI: 'public.json' });
  await useSettingsStore.getState().update({ lastExportAt: new Date().toISOString() });
  await scheduleBackupReminder();
  return true;
}

/** Lets the user choose a file and checks it. null when they cancel; throws BackupError if broken. */
export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > 30_000_000) throw new BackupError('tooLarge');
  return parseBackup(await new File(asset.uri).text());
}

/** Restores a checked backup. Everything is written in one transaction: all or nothing. */
export async function importBackup(backup: BackupFile, mode: ImportMode) {
  const database = await db();
  const plan = planImport(await liveRows(), backup, mode);
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (txn) => {
    for (const c of plan.categories) {
      await txn.runAsync(
        `INSERT INTO categories (${CATEGORY_COLUMNS}, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon, position = excluded.position,
           default_key = excluded.default_key, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 1`,
        c.id, c.name, c.color, c.icon, c.position, c.default_key, c.created_at, c.updated_at,
      );
    }
    for (const t of plan.tasks) {
      await txn.runAsync(
        `INSERT INTO tasks (${TASK_COLUMNS}, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, status = excluded.status,
           priority = excluded.priority, category_id = excluded.category_id, due_date = excluded.due_date, start_time = excluded.start_time,
           duration = excluded.duration, deadline = excluded.deadline, reminder = excluded.reminder, reminder_at = excluded.reminder_at,
           completed_at = excluded.completed_at, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 1`,
        t.id, t.title, t.description, t.status, t.priority, t.category_id, t.due_date, t.start_time, t.duration, t.deadline,
        t.reminder, t.reminder_at, t.completed_at, t.created_at, t.updated_at,
      );
    }
    for (const id of plan.removeTaskIds) {
      await txn.runAsync('UPDATE tasks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', now, now, id);
    }
    for (const id of plan.removeCategoryIds) {
      await txn.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', now, now, id);
    }
    for (const [key, value] of Object.entries(plan.settings)) {
      if (DEVICE_ONLY_SETTINGS.includes(key)) continue;
      await txn.runAsync(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        key, JSON.stringify(value), now,
      );
    }
  });
  await useSettingsStore.getState().load();
  await useTasksStore.getState().loadTasks();
  useTasksStore.setState((state) => ({ version: state.version + 1 }));
  notifyDataChanged();
  void rescheduleAll(useTasksStore.getState().tasks).catch(() => undefined);
  return plan.counts;
}

/** The translated message for a broken backup file. */
export function backupErrorMessage(error: unknown) {
  if (error instanceof BackupError) return translate(`backup.error_${error.problem}`);
  return translate('backup.errorRead');
}

/**
 * "Protect your tasks" reminder: only when not signed in (signed-in users are backed up by
 * sync), and only if the setting is on. Due 7 or 30 days after the last export (or first use).
 */
export async function scheduleBackupReminder(signedIn = false) {
  const settings = getSettings();
  if (signedIn || !settings.backupReminderEnabled) {
    await cancelScheduled(BACKUP_REMINDER_ID);
    return;
  }
  let firstUse = await readSetting<string | null>('firstUseAt', null);
  if (!firstUse) {
    firstUse = new Date().toISOString();
    await writeSetting('firstUseAt', firstUse);
  }
  let when = nextBackupReminder(settings.lastExportAt, firstUse, settings.backupFrequency);
  if (when.getTime() <= Date.now() + 60_000) {
    // Already due: remind tomorrow morning rather than every time the app opens.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    when = tomorrow;
  }
  await scheduleAt(BACKUP_REMINDER_ID, when, {
    title: translate('backup.reminderTitle'),
    body: translate('backup.reminderBody'),
    data: { type: 'backup' },
  });
}
