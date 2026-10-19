/**
 * Server backup and sync of the phone's tasks and categories.
 *
 * POST /api/sync { cursor, changes: [{ kind, id, data, updatedAt, deleted }] }
 * - Each change is stored per user (user id from the sign-in token, never from the request).
 * - Conflicts: a change only replaces the stored copy if its updatedAt is newer.
 * - The answer has every stored change after `cursor` (the phone's last position), including
 *   other phones' changes, in pages of PAGE_SIZE ({ changes, cursor, hasMore }).
 * The server keeps the phone's JSON as is; the phone checks records before using them.
 */
const KINDS = new Set(['task', 'category']);
const ID_RE = /^[\w-]{1,64}$/;
const MAX_CHANGES = 1000;
const MAX_DATA_BYTES = 20_000;
const PAGE_SIZE = 500;

class SyncError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'SYNC_INVALID';
  }
}

/** Checks the request body. Returns { cursor: bigint, changes } or throws SyncError. */
function validateSyncRequest(body) {
  const rawCursor = body?.cursor;
  let cursor = 0n;
  if (rawCursor !== null && rawCursor !== undefined && rawCursor !== '') {
    if (typeof rawCursor !== 'string' || !/^\d{1,19}$/.test(rawCursor)) throw new SyncError('Bad cursor.');
    cursor = BigInt(rawCursor);
  }
  const list = body?.changes ?? [];
  if (!Array.isArray(list) || list.length > MAX_CHANGES) throw new SyncError('Bad change list.');
  const changes = list.map((raw, index) => {
    const fail = (what) => {
      throw new SyncError(`Change ${index + 1}: ${what}.`);
    };
    if (!raw || typeof raw !== 'object') fail('not an object');
    if (!KINDS.has(raw.kind)) fail('kind');
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) fail('id');
    let updatedAt = new Date(raw.updatedAt);
    if (typeof raw.updatedAt !== 'string' || Number.isNaN(updatedAt.getTime())) fail('updatedAt');
    // Phone clocks can be wrong: a date far in the future would win every conflict forever.
    const latest = Date.now() + 24 * 60 * 60 * 1000;
    if (updatedAt.getTime() > latest) updatedAt = new Date(latest);
    const deleted = Boolean(raw.deleted);
    let data = null;
    if (!deleted) {
      if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) fail('data');
      if (raw.data.id !== raw.id) fail('data id');
      data = JSON.stringify(raw.data);
      if (Buffer.byteLength(data) > MAX_DATA_BYTES) fail('too large');
    }
    return { kind: raw.kind, id: raw.id, data, updatedAt, deleted };
  });
  return { cursor, changes };
}

function toRecord(row) {
  let data = null;
  if (!row.deleted && row.data) {
    try {
      data = JSON.parse(row.data);
    } catch {
      data = null;
    }
  }
  return { kind: row.kind, id: row.item_id, data, updatedAt: new Date(row.updated_at).toISOString(), deleted: row.deleted || data === null };
}

async function applySync(prisma, userId, body) {
  const { cursor, changes } = validateSyncRequest(body);
  for (const change of changes) {
    // Newer wins; every accepted change gets a new sequence number.
    await prisma.$executeRaw`
      INSERT INTO sync_items (user_id, kind, item_id, data, updated_at, deleted)
      VALUES (${userId}, ${change.kind}, ${change.id}, ${change.data}, ${change.updatedAt}, ${change.deleted})
      ON CONFLICT (user_id, kind, item_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted,
            seq = nextval(pg_get_serial_sequence('sync_items', 'seq'))
        WHERE sync_items.updated_at < EXCLUDED.updated_at`;
  }
  const rows = await prisma.$queryRaw`
    SELECT kind, item_id, data, updated_at, deleted, seq FROM sync_items
    WHERE user_id = ${userId} AND seq > ${cursor}
    ORDER BY seq LIMIT ${PAGE_SIZE + 1}`;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.length ? page[page.length - 1].seq : cursor;
  return {
    changes: page.map(toRecord),
    cursor: String(last),
    hasMore: rows.length > PAGE_SIZE,
    accepted: changes.length,
  };
}

module.exports = { applySync, validateSyncRequest, SyncError, PAGE_SIZE, MAX_CHANGES };
