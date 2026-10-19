// Account and sync input checks (no database needed).
const test = require('node:test');
const assert = require('node:assert/strict');

const accounts = require('../src/lib/accounts');
const { validateSyncRequest } = require('../src/lib/sync');

const code = (fn) => {
  try {
    fn();
    return 'ok';
  } catch (error) {
    return error.code;
  }
};

test('sign-up checks name, email and an 8-character password', () => {
  assert.equal(code(() => accounts.validateRegistration({ name: '', email: 'a@b.co', password: '12345678' })), 'NAME_REQUIRED');
  assert.equal(code(() => accounts.validateRegistration({ name: 'Ann', email: 'not-an-email', password: '12345678' })), 'INVALID_EMAIL');
  assert.equal(code(() => accounts.validateRegistration({ name: 'Ann', email: 'a@b.co', password: '1234567' })), 'WEAK_PASSWORD');
  assert.equal(code(() => accounts.validateRegistration({ name: 'Ann', email: 'a@b.co', password: 12345678 })), 'WEAK_PASSWORD');
  const ok = accounts.validateRegistration({ name: '  Ann   Uwase ', email: ' Ann@Example.COM ', password: 'longenough' });
  assert.deepEqual(ok, { name: 'Ann Uwase', email: 'ann@example.com', password: 'longenough' });
});

test('refresh tokens are stored as hashes; reset codes are 6 random digits', () => {
  assert.equal(accounts.hashToken('abc'), accounts.hashToken('abc'));
  assert.notEqual(accounts.hashToken('abc'), 'abc');
  assert.equal(accounts.hashToken('abc').length, 64);
  const codes = new Set(Array.from({ length: 50 }, () => accounts.resetCode()));
  for (const value of codes) assert.match(value, /^\d{6}$/);
  assert.ok(codes.size > 40, 'codes vary');
});

test('sync requests are checked before anything is stored', () => {
  const task = { kind: 'task', id: 'a-1', data: { id: 'a-1', title: 'Gym' }, updatedAt: '2026-10-19T10:00:00.000Z', deleted: false };
  assert.equal(validateSyncRequest({ cursor: null, changes: [task] }).changes.length, 1);
  assert.equal(validateSyncRequest({}).cursor, 0n);
  assert.equal(validateSyncRequest({ cursor: '42' }).cursor, 42n);
  assert.equal(code(() => validateSyncRequest({ cursor: 'DROP TABLE' })), 'SYNC_INVALID');
  assert.equal(code(() => validateSyncRequest({ changes: [{ ...task, kind: 'note' }] })), 'SYNC_INVALID');
  assert.equal(code(() => validateSyncRequest({ changes: [{ ...task, id: '../x' }] })), 'SYNC_INVALID');
  assert.equal(code(() => validateSyncRequest({ changes: [{ ...task, data: { id: 'other' } }] })), 'SYNC_INVALID');
  assert.equal(code(() => validateSyncRequest({ changes: [{ ...task, updatedAt: 'soon' }] })), 'SYNC_INVALID');
  assert.equal(code(() => validateSyncRequest({ changes: Array.from({ length: 1001 }, () => task) })), 'SYNC_INVALID');
  const deletion = validateSyncRequest({ changes: [{ kind: 'task', id: 'a-1', deleted: true, updatedAt: task.updatedAt }] }).changes[0];
  assert.deepEqual([deletion.deleted, deletion.data], [true, null]);
});

test('a phone clock far in the future cannot win every conflict', () => {
  const future = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const [change] = validateSyncRequest({ changes: [{ kind: 'task', id: 'x', data: { id: 'x' }, updatedAt: future }] }).changes;
  assert.ok(change.updatedAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000 + 1000);
});
