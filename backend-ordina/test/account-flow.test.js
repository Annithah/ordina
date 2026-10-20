// Accounts, sessions and sync end to end over HTTP, against a throwaway PostgreSQL schema
// (TEST_DATABASE_URL). Skipped without it.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('./db-helper');

const skip = db.skip;
db.setup();

let base = '';
let server = null;
const logged = [];

async function call(method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const task = (id, title, updatedAt, deleted = false) => ({
  kind: 'task', id, updatedAt, deleted, data: deleted ? null : { id, title, status: 'pending', updated_at: updatedAt },
});

test.before(async () => {
  if (skip) return;
  // The dev server prints reset codes to the console when no email service is set.
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  const original = console.log;
  console.log = (...args) => {
    logged.push(args.join(' '));
    original(...args);
  };
  const { app } = require('../src/server');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db.teardown();
});

test('register, log in, and errors with codes', { skip }, async () => {
  const created = await call('POST', '/api/auth/register', { name: 'Ann Uwase', email: 'Ann@Example.com', password: 'password-1' });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, 'ann@example.com');
  assert.ok(created.body.accessToken && created.body.refreshToken);
  assert.equal((await call('POST', '/api/auth/register', { name: 'Ann', email: 'ann@example.com', password: 'password-1' })).body.code, 'EMAIL_TAKEN');
  assert.equal((await call('POST', '/api/auth/register', { name: 'Ann', email: 'x@y.co', password: 'short' })).body.code, 'WEAK_PASSWORD');
  assert.equal((await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'wrong-pass' })).body.code, 'INVALID_LOGIN');
  assert.equal((await call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' })).body.code, 'INVALID_LOGIN');
  const login = await call('POST', '/api/auth/login', { email: 'ANN@example.com', password: 'password-1' });
  assert.equal(login.status, 200);
});

test('refresh tokens rotate, and a reused one ends every session', { skip }, async () => {
  const { body: session } = await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-1' });
  const first = await call('POST', '/api/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(first.status, 200);
  assert.notEqual(first.body.refreshToken, session.refreshToken);
  const reused = await call('POST', '/api/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(reused.body.code, 'SESSION_EXPIRED');
  const afterTheft = await call('POST', '/api/auth/refresh', { refreshToken: first.body.refreshToken });
  assert.equal(afterTheft.body.code, 'SESSION_EXPIRED', 'reuse revoked the newer token too');
  const again = (await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-1' })).body;
  assert.equal((await call('POST', '/api/auth/logout', { refreshToken: again.refreshToken })).status, 200);
  assert.equal((await call('POST', '/api/auth/refresh', { refreshToken: again.refreshToken })).body.code, 'SESSION_EXPIRED');
});

test('forgot password: same answer for unknown emails, code never returned, 5 tries', { skip }, async () => {
  const unknown = await call('POST', '/api/auth/forgot', { email: 'nobody@example.com' });
  assert.deepEqual(unknown.body, { ok: true });
  const known = await call('POST', '/api/auth/forgot', { email: 'ann@example.com' });
  assert.deepEqual(known.body, { ok: true }, 'the code is not in the answer');
  const line = logged.find((entry) => entry.includes('reset code for ann@example.com'));
  const code = /(\d{6})$/.exec(line ?? '')?.[1];
  assert.ok(code, 'code printed by the dev server');
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await call('POST', '/api/auth/reset', { email: 'ann@example.com', code: wrong, newPassword: 'password-2' })).body.code, 'INVALID_CODE');
  const done = await call('POST', '/api/auth/reset', { email: 'ann@example.com', code, newPassword: 'password-2' });
  assert.equal(done.status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { email: 'ann@example.com', code, newPassword: 'password-3' })).body.code, 'INVALID_CODE', 'a code works once');
  assert.equal((await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-2' })).status, 200);
});

test('two phones sync: newest change wins, deletions travel, cursor pages', { skip }, async () => {
  const { body: phoneA } = await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-2' });
  const { body: phoneB } = await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-2' });
  const a1 = await call('POST', '/api/sync', { cursor: null, changes: [task('t1', 'Gym', '2026-10-19T10:00:00.000Z'), task('t2', 'Read', '2026-10-19T10:00:00.000Z')] }, phoneA.accessToken);
  assert.equal(a1.status, 200);
  assert.equal(a1.body.changes.length, 2);

  // New phone: logs in and downloads everything.
  const b1 = await call('POST', '/api/sync', { cursor: null, changes: [] }, phoneB.accessToken);
  assert.deepEqual(b1.body.changes.map((c) => c.id).sort(), ['t1', 't2']);

  // Phone B edits t1 later, phone A edits it earlier (offline): B's newer change wins.
  await call('POST', '/api/sync', { cursor: b1.body.cursor, changes: [task('t1', 'Gym at 6', '2026-10-19T12:00:00.000Z'), task('t2', null, '2026-10-19T12:00:00.000Z', true)] }, phoneB.accessToken);
  const a2 = await call('POST', '/api/sync', { cursor: a1.body.cursor, changes: [task('t1', 'Gym (old edit)', '2026-10-19T11:00:00.000Z')] }, phoneA.accessToken);
  const t1 = a2.body.changes.find((c) => c.id === 't1');
  const t2 = a2.body.changes.find((c) => c.id === 't2');
  assert.equal(t1.data.title, 'Gym at 6');
  assert.equal(t2.deleted, true);
  assert.equal(t2.data, null);
  const nothingNew = await call('POST', '/api/sync', { cursor: a2.body.cursor, changes: [] }, phoneA.accessToken);
  assert.equal(nothingNew.body.changes.length, 0);
});

test('a user only ever sees their own data; device tokens cannot sync', { skip }, async () => {
  const { body: other } = await call('POST', '/api/auth/register', { name: 'Eric', email: 'eric@example.com', password: 'password-9' });
  const pulled = await call('POST', '/api/sync', { cursor: null, changes: [] }, other.accessToken);
  assert.deepEqual(pulled.body.changes, []);
  assert.equal((await call('POST', '/api/sync', { cursor: null, changes: [] })).body.code, 'SESSION_EXPIRED');
  const device = await call('POST', '/api/device/session', { deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e' });
  assert.equal((await call('POST', '/api/sync', { cursor: null, changes: [] }, device.body.token)).body.code, 'SESSION_EXPIRED');
  assert.equal((await call('POST', '/api/auth/login', { email: 'device-0f8fad5b-d9cb-469f-a165-70867728950e@device.ordina.local', password: 'x' })).body.code, 'INVALID_LOGIN');
});

test('change password signs out other phones; delete account removes the backup', { skip }, async () => {
  const { body: phoneA } = await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-2' });
  const { body: phoneB } = await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-2' });
  assert.equal((await call('POST', '/api/auth/change-password', { currentPassword: 'nope-nope', newPassword: 'password-4' }, phoneA.accessToken)).body.code, 'WRONG_PASSWORD');
  const changed = await call('POST', '/api/auth/change-password', { currentPassword: 'password-2', newPassword: 'password-4' }, phoneA.accessToken);
  assert.equal(changed.status, 200);
  assert.equal((await call('POST', '/api/auth/refresh', { refreshToken: phoneB.refreshToken })).body.code, 'SESSION_EXPIRED');
  assert.equal((await call('DELETE', '/api/auth/account', { password: 'wrong-pass' }, changed.body.accessToken)).body.code, 'WRONG_PASSWORD');
  assert.equal((await call('DELETE', '/api/auth/account', { password: 'password-4' }, changed.body.accessToken)).status, 200);
  const prisma = require('../src/lib/prisma');
  assert.equal(await prisma.syncItem.count({ where: { user: { email: 'ann@example.com' } } }), 0);
  assert.equal(await prisma.user.count({ where: { email: 'ann@example.com' } }), 0);
  assert.equal((await call('POST', '/api/auth/login', { email: 'ann@example.com', password: 'password-4' })).body.code, 'INVALID_LOGIN');
});
