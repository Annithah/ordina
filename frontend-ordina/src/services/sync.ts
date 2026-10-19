/**
 * Server backup and sync (signed-in users only). The phone's SQLite stays the main copy:
 * - changes made offline wait (dirty = 1) and are sent when the connection returns;
 * - the server answers with every change since our last sync (other phones included);
 * - conflicts: the most recent change wins (logic/sync.ts); deletions sync as soft deletes.
 * A new phone downloads everything on its first sync after signing in.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';

import { BackupError } from '@/logic/backup';
import { shouldApply, toRecord, validRecord, type SyncRecord, type SyncStatus } from '@/logic/sync';
import { API_BASE_URL, COLD_START_MS, api } from '@/services/api';
import { scheduleBackupReminder } from '@/services/backup';
import { onDataChanged } from '@/services/data-events';
import { db, readSetting, writeSetting, type CategoryRow, type TaskRow } from '@/services/local-tasks';
import { isOnline, onBackOnline } from '@/services/network';
import { rescheduleAll } from '@/services/task-reminders';
import { onAuthChanged, useAuthStore } from '@/store/auth-store';
import { useTasksStore } from '@/store/tasks-store';

const BATCH = 300;
const DEBOUNCE_MS = 4000;

type SyncState = {
  status: SyncStatus;
  lastSyncAt: string | null;
  load: () => Promise<void>;
};

export const useSyncStore = create<SyncState>((set) => ({
  status: 'signedOut',
  lastSyncAt: null,
  load: async () => set({ lastSyncAt: await readSetting<string | null>('lastSyncAt', null) }),
}));

const setStatus = (status: SyncStatus) => useSyncStore.setState({ status });

async function dirtyRecords(): Promise<{ records: SyncRecord[]; sent: { kind: 'task' | 'category'; id: string; updatedAt: string }[] }> {
  const database = await db();
  const [categories, tasks] = await Promise.all([
    database.getAllAsync<CategoryRow>('SELECT * FROM categories WHERE dirty = 1 LIMIT ?', BATCH),
    database.getAllAsync<TaskRow>('SELECT * FROM tasks WHERE dirty = 1 LIMIT ?', BATCH),
  ]);
  // Categories first, so tasks never arrive before their category.
  const records = [
    ...categories.map((row) => toRecord('category', row as unknown as Parameters<typeof toRecord>[1])),
    ...tasks.map((row) => {
      const { category: _legacy, ...rest } = row;
      return toRecord('task', rest as unknown as Parameters<typeof toRecord>[1]);
    }),
  ];
  return { records, sent: records.map((r) => ({ kind: r.kind, id: r.id, updatedAt: r.updatedAt })) };
}

async function applyResponse(sent: { kind: 'task' | 'category'; id: string; updatedAt: string }[], incoming: SyncRecord[]) {
  const database = await db();
  let changed = false;
  await database.withExclusiveTransactionAsync(async (txn) => {
    // What we sent is now on the server, unless it changed again while we were sending.
    for (const item of sent) {
      const table = item.kind === 'task' ? 'tasks' : 'categories';
      await txn.runAsync(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, item.id, item.updatedAt);
    }
    for (const record of incoming) {
      const table = record.kind === 'task' ? 'tasks' : 'categories';
      const local = await txn.getFirstAsync<{ updated_at: string; dirty: number }>(`SELECT updated_at, dirty FROM ${table} WHERE id = ?`, record.id);
      if (!shouldApply(local, record)) continue;
      changed = true;
      if (record.deleted || !record.data) {
        await txn.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 0 WHERE id = ?`, record.updatedAt, record.updatedAt, record.id);
        continue;
      }
      if (record.kind === 'category') {
        const c = record.data as unknown as CategoryRow;
        await txn.runAsync(
          `INSERT INTO categories (id, name, color, icon, position, default_key, created_at, updated_at, deleted_at, dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon, position = excluded.position,
             default_key = excluded.default_key, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 0`,
          c.id, c.name, c.color, c.icon, c.position, c.default_key, c.created_at, c.updated_at,
        );
      } else {
        const t = record.data as unknown as TaskRow;
        await txn.runAsync(
          `INSERT INTO tasks (id, title, description, status, priority, category_id, due_date, start_time, duration, deadline,
             reminder, reminder_at, completed_at, created_at, updated_at, deleted_at, dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, status = excluded.status,
             priority = excluded.priority, category_id = excluded.category_id, due_date = excluded.due_date, start_time = excluded.start_time,
             duration = excluded.duration, deadline = excluded.deadline, reminder = excluded.reminder, reminder_at = excluded.reminder_at,
             completed_at = excluded.completed_at, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 0`,
          t.id, t.title, t.description, t.status, t.priority, t.category_id, t.due_date, t.start_time, t.duration, t.deadline,
          t.reminder, t.reminder_at, t.completed_at, t.created_at, t.updated_at,
        );
      }
    }
  });
  return changed;
}

let running: Promise<void> | null = null;
let again = false;

/** Sends unsent changes and downloads new ones. Safe to call often; runs one at a time. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runSync();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runSync() {
  if (!useAuthStore.getState().isSignedIn) {
    setStatus('signedOut');
    return;
  }
  if (!API_BASE_URL) {
    setStatus('noServer');
    return;
  }
  if (!(await isOnline())) {
    setStatus('waiting');
    return;
  }
  setStatus('syncing');
  let anyChange = false;
  try {
    for (let round = 0; round < 50; round += 1) {
      const cursor = await readSetting<string | null>('syncCursor', null);
      const { records, sent } = await dirtyRecords();
      const { data } = await api.post('/api/sync', { cursor, changes: records }, { timeout: 30_000 + COLD_START_MS });
      const incoming = (Array.isArray(data?.changes) ? data.changes : []).map(validRecord).filter((r: SyncRecord | null): r is SyncRecord => r !== null);
      if (await applyResponse(sent, incoming)) anyChange = true;
      if (typeof data?.cursor === 'string') await writeSetting('syncCursor', data.cursor);
      // Stop when everything was sent and the server has nothing more to send back.
      const fullBatch = records.length >= BATCH;
      if (!fullBatch && !data?.hasMore) break;
    }
    const now = new Date().toISOString();
    await writeSetting('lastSyncAt', now);
    useSyncStore.setState({ status: 'idle', lastSyncAt: now });
  } catch (error) {
    const err = error as { response?: { status?: number } };
    if (err instanceof BackupError) setStatus('error');
    else if (!err?.response) setStatus((await isOnline()) ? 'error' : 'waiting');
    else setStatus('error');
  } finally {
    if (anyChange) {
      await useTasksStore.getState().loadTasks();
      useTasksStore.setState((state) => ({ version: state.version + 1 }));
      void rescheduleAll(useTasksStore.getState().tasks).catch(() => undefined);
    }
  }
}

/** Starts automatic sync: after changes, when back online, when the app returns, on sign-in. */
export function startSync() {
  void useSyncStore.getState().load();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (!useAuthStore.getState().isSignedIn) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  };
  const offData = onDataChanged(soon);
  const offOnline = onBackOnline(() => void syncNow());
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncNow();
  });
  const offAuth = onAuthChanged((signedIn) => {
    if (signedIn) {
      void syncNow();
      void scheduleBackupReminder(true).catch(() => undefined);
      return;
    }
    // Signed out: forget the server position and keep every task on the phone, marked unsent,
    // so they reach whichever account signs in next.
    void (async () => {
      await writeSetting('syncCursor', null);
      await writeSetting('lastSyncAt', null);
      const database = await db();
      await database.execAsync('UPDATE tasks SET dirty = 1; UPDATE categories SET dirty = 1;');
      useSyncStore.setState({ status: 'signedOut', lastSyncAt: null });
      await scheduleBackupReminder(false).catch(() => undefined);
    })();
  });
  // The first sync starts when the saved session is read (onAuthChanged from hydrate).
  return () => {
    if (timer) clearTimeout(timer);
    offData();
    offOnline();
    appState.remove();
    offAuth();
  };
}
