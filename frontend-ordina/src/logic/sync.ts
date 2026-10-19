/**
 * Sync rules (phone <-> server). No app imports, so the unit tests run with plain Node.
 *
 * The phone's SQLite stays the main copy. Each change is a record { kind, id, data, updatedAt,
 * deleted }. Offline changes wait (dirty = 1) and are sent when the connection returns.
 * Conflicts: the most recent `updatedAt` wins; on a tie the server copy is kept unless the
 * phone has an unsent change. Deletions are records too (deleted = true, soft delete).
 */
import { type BackupCategory, type BackupTask, validateCategoryRow, validateTaskRow } from './backup.ts';

export type SyncKind = 'task' | 'category';

export type SyncRecord = {
  kind: SyncKind;
  id: string;
  /** The row's fields (as in the backup file); null for a deletion. */
  data: BackupTask | BackupCategory | null;
  updatedAt: string;
  deleted: boolean;
};

type LocalRow = { id: string; updated_at: string; deleted_at: string | null; dirty: number };

/** A local row (task or category) as a sync record. */
export function toRecord(kind: SyncKind, row: LocalRow & Record<string, unknown>): SyncRecord {
  const { dirty: _dirty, deleted_at, ...rest } = row;
  const data = deleted_at ? null : (rest as unknown as BackupTask | BackupCategory);
  return { kind, id: row.id, data, updatedAt: row.updated_at, deleted: Boolean(deleted_at) };
}

/**
 * Whether a record from the server should overwrite the phone's row.
 * - No row on the phone: take it (a deletion of something we never had is ignored).
 * - Newer on the server: take it.
 * - Same time: take it only if the phone has nothing unsent for that row.
 */
export function shouldApply(local: Pick<LocalRow, 'updated_at' | 'dirty'> | null | undefined, remote: Pick<SyncRecord, 'updatedAt' | 'deleted'>) {
  if (!local) return !remote.deleted;
  const mine = Date.parse(local.updated_at);
  const theirs = Date.parse(remote.updatedAt);
  if (Number.isNaN(theirs)) return false;
  if (theirs > mine) return true;
  if (theirs === mine) return !local.dirty;
  return false;
}

/** Checks a record from the server before it touches the phone database. */
export function validRecord(raw: unknown): SyncRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'task' && r.kind !== 'category') return null;
  if (typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id)) return null;
  if (typeof r.updatedAt !== 'string' || Number.isNaN(Date.parse(r.updatedAt))) return null;
  const deleted = Boolean(r.deleted);
  if (deleted) return { kind: r.kind, id: r.id, data: null, updatedAt: r.updatedAt, deleted };
  try {
    const data = r.kind === 'task' ? validateTaskRow(r.data, 0) : validateCategoryRow(r.data, 0);
    if (data.id !== r.id) return null;
    return { kind: r.kind, id: r.id, data, updatedAt: r.updatedAt, deleted };
  } catch {
    return null;
  }
}

export type SyncStatus = 'signedOut' | 'idle' | 'syncing' | 'waiting' | 'error' | 'noServer';
