// Duplicate prevention for AI plan confirmation, against a real temporary SQLite database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbFile = path.join(os.tmpdir(), `ordina-plan-test-${process.pid}.sqlite`);
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, '/')}`;

const backendRoot = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(backendRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: backendRoot,
  env: { ...process.env },
  stdio: 'ignore',
});

const prisma = require('../src/lib/prisma');
const { ensureSchema } = require('../src/lib/ensure-schema');
const { confirmPlan } = require('../src/lib/plan-service');

const helpers = {
  taskPayload: (body, userId) => ({
    userId,
    title: body.title,
    description: body.description,
    status: 'pending',
    priority: body.priority === 'high' ? 3 : body.priority === 'medium' ? 2 : 1,
    dueAt: new Date(`${body.dueDate}T12:00:00.000Z`),
    startTime: body.startTime,
    duration: body.duration,
  }),
  setTaskCategory: async () => undefined,
  setTaskDeadline: async (taskId, deadline) => {
    if (deadline) await prisma.taskDeadline.create({ data: { taskId, deadline } });
  },
  mapTask: (task) => ({ id: String(task.id), title: task.title, deadline: task.deadline?.deadline }),
  include: { deadline: true },
};

const plan = [
  { title: 'Study Python', date: '2026-10-16', startTime: '09:00', durationMinutes: 120, priority: 'medium' },
  {
    title: 'Exercise',
    date: '2026-10-16',
    startTime: '06:00',
    durationMinutes: 45,
    priority: 'medium',
    original: { startTime: '19:00', durationMinutes: 30, priority: 'medium', sources: { startTime: 'ai', durationMinutes: 'ai', priority: 'ai' } },
  },
  { title: 'Finish report', date: '2026-10-15', startTime: '11:00', durationMinutes: 90, priority: 'high', deadline: '2026-10-15T14:00' },
];

let userId;

test.before(async () => {
  // Same as server start: some columns are only added at runtime.
  await ensureSchema(prisma);
  const user = await prisma.user.create({ data: { email: 'plan@test.local', passwordHash: 'x', displayName: 'Plan Tester' } });
  userId = user.id;
});

test.after(async () => {
  await prisma.$disconnect();
  for (const suffix of ['', '-shm', '-wal', '-journal']) fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

test('confirming the same plan twice creates the tasks once', async () => {
  const first = await confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0001', tasks: plan }, helpers);
  assert.equal(first.created.length, 3);
  assert.equal(first.replayed, undefined);
  assert.equal(first.created[2].deadline, '2026-10-15T14:00');

  const again = await confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0001', tasks: plan }, helpers);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.created.map((t) => t.id), first.created.map((t) => t.id));
  assert.equal(await prisma.task.count({ where: { userId } }), 3);
});

test('simultaneous double taps do not duplicate tasks', async () => {
  const results = await Promise.allSettled([
    confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0002', tasks: plan.slice(0, 1) }, helpers),
    confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0002', tasks: plan.slice(0, 1) }, helpers),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.ok(ok.length >= 1);
  for (const rejected of results.filter((r) => r.status === 'rejected')) assert.equal(rejected.reason.status, 409);
  assert.equal(await prisma.task.count({ where: { userId, title: 'Study Python' } }), 2);
});

test('a corrected suggestion is saved to the planning profile', async () => {
  const row = await prisma.planningProfile.findUnique({ where: { userId } });
  const profile = JSON.parse(row.data);
  assert.deepEqual(profile.corrections.map((c) => [c.type, c.field, c.to]), [
    ['exercise', 'startTime', '06:00'],
    ['exercise', 'durationMinutes', 45],
  ]);
  assert.equal(profile.habits.exercise.start, '06:00');
});

test('invalid plans are rejected before anything is saved', async () => {
  const before = await prisma.task.count({ where: { userId } });
  await assert.rejects(confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0003', tasks: [] }, helpers), { status: 400 });
  await assert.rejects(confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0003', tasks: [{ title: '', date: '2026-10-16' }] }, helpers), { status: 400 });
  await assert.rejects(confirmPlan(prisma, userId, { idempotencyKey: 'plan-key-0003', tasks: [{ title: 'No date' }] }, helpers), { status: 400 });
  await assert.rejects(confirmPlan(prisma, userId, { idempotencyKey: 'x', tasks: plan }, helpers), { status: 400 });
  assert.equal(await prisma.task.count({ where: { userId } }), before);
  assert.equal(await prisma.aiPlanConfirmation.count({ where: { idempotencyKey: 'plan-key-0003' } }), 0);
});
