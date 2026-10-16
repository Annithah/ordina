/**
 * Persistence for ORDINA AI planning: the per-user planning profile and the
 * exactly-once confirmation of a reviewed plan into the normal tasks table.
 */

const {
  HISTORY_DAYS,
  HISTORY_LIMIT,
  classifyTaskType,
  computeProfile,
  correctionsFrom,
  mergeCorrections,
} = require('./planning-profile');
const { firstError, validateTaskInput } = require('./task-validation');

const MAX_PLAN_TASKS = 20;
const TYPE_CATEGORY = {
  exercise: 'health',
  study: 'learning',
  work: 'work',
  meeting: 'work',
  call: 'personal',
  errand: 'personal',
  chores: 'personal',
  meal: 'personal',
  other: 'personal',
};

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

/** Recomputes the profile from the user's recent tasks plus stored corrections, saves it, returns it. */
async function refreshProfile(prisma, userId, addedCorrections = []) {
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const [tasks, row] = await Promise.all([
    prisma.task.findMany({
      where: { userId, parentTaskId: null, OR: [{ dueAt: { gte: since } }, { createdAt: { gte: since } }] },
      orderBy: { updatedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { title: true, description: true, startTime: true, duration: true, priority: true },
    }),
    prisma.planningProfile.findUnique({ where: { userId } }),
  ]);
  const corrections = mergeCorrections(parseJson(row?.data, {}).corrections, addedCorrections);
  const profile = { ...computeProfile(tasks, corrections), corrections };
  const data = JSON.stringify(profile);
  await prisma.planningProfile.upsert({ where: { userId }, update: { data }, create: { userId, data } });
  return profile;
}

function validatePlanTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw httpError(400, 'Choose at least one task to add.');
  if (tasks.length > MAX_PLAN_TASKS) throw httpError(400, `A plan can add at most ${MAX_PLAN_TASKS} tasks at once.`);
  return tasks.map((task, index) => {
    const { value, errors } = validateTaskInput({
      title: task?.title,
      description: task?.description ?? null,
      date: task?.date,
      startTime: task?.startTime ?? null,
      durationMinutes: task?.durationMinutes ?? null,
      priority: task?.priority ?? 'medium',
      deadline: task?.deadline ?? null,
    });
    if (!value.dueDate && !errors.dueDate) errors.dueDate = 'Please choose a date.';
    if (Object.keys(errors).length) {
      throw httpError(400, `Task ${index + 1}: ${firstError(errors)}`, { errors: { index, ...errors } });
    }
    const type = classifyTaskType(value.title, value.description, task?.type);
    return { input: task, value, type };
  });
}

/**
 * Saves a reviewed plan exactly once per idempotency key. A repeated request with
 * the same key (double tap, retry after a dropped connection) returns the tasks
 * that were created the first time instead of creating them again.
 */
async function confirmPlan(prisma, userId, { idempotencyKey, tasks }, { taskPayload, setTaskCategory, setTaskDeadline, mapTask, include }) {
  const key = String(idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 100) throw httpError(400, 'This plan is missing its confirmation key. Please plan again.');
  const items = validatePlanTasks(tasks);

  let confirmation;
  try {
    confirmation = await prisma.aiPlanConfirmation.create({ data: { userId, idempotencyKey: key } });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const existing = await prisma.aiPlanConfirmation.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
    if (existing?.response) return { ...parseJson(existing.response, {}), replayed: true };
    throw httpError(409, 'This plan is already being saved.', { code: 'PLAN_SAVING' });
  }

  const createdIds = [];
  try {
    for (const { value, type } of items) {
      const row = await prisma.task.create({
        data: taskPayload({
          title: value.title,
          description: value.description ?? null,
          dueDate: value.dueDate,
          startTime: value.startTime ?? null,
          duration: value.duration ?? null,
          priority: value.priority ?? 'medium',
          reminder: false,
        }, userId),
      });
      createdIds.push(row.id);
      await setTaskCategory(userId, row.id, TYPE_CATEGORY[type] || 'personal');
      await setTaskDeadline(row.id, value.deadline ?? undefined);
    }
    const created = await prisma.task.findMany({ where: { id: { in: createdIds } }, include, orderBy: { id: 'asc' } });
    const response = { created: created.map(mapTask) };
    await prisma.aiPlanConfirmation.update({ where: { id: confirmation.id }, data: { response: JSON.stringify(response) } });

    // Learning is best-effort: the tasks are already saved.
    const corrections = correctionsFrom(items.map(({ input, value, type }) => ({
      title: value.title,
      description: value.description,
      type,
      startTime: value.startTime ?? null,
      durationMinutes: input?.durationMinutes ?? null,
      priority: value.priority ?? null,
      original: input?.original,
    })));
    await refreshProfile(prisma, userId, corrections).catch((error) => {
      console.error('Planning profile update failed:', error.message);
    });
    return { ...response, learned: corrections.length };
  } catch (error) {
    // Undo a partial save so the user can simply try again.
    if (createdIds.length) await prisma.task.deleteMany({ where: { id: { in: createdIds }, userId } }).catch(() => undefined);
    await prisma.aiPlanConfirmation.delete({ where: { id: confirmation.id } }).catch(() => undefined);
    throw error;
  }
}

module.exports = { TYPE_CATEGORY, confirmPlan, refreshProfile, validatePlanTasks };
