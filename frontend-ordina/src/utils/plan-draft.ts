import { OTHER_CATEGORY_ID, suggestCategoryId } from '@/logic/categories';
import type { DraftTask, PlanField, PlanTask, ValueSource } from '@/types/plan';
import { addLocalDays } from '@/utils/dates';
import { minutesFromTime, timeFromMinutes } from '@/utils/task-planning';

let counter = 0;

/**
 * Plan tasks -> editable drafts. Tasks without a category get one suggested from the title
 * (only among `categoryIds`, the user's categories), else "Other".
 */
export function toDrafts(tasks: (Omit<PlanTask, 'categoryId'> & { categoryId?: string })[], categoryIds?: string[]): DraftTask[] {
  return tasks.map((task) => {
    counter += 1;
    const suggested = suggestCategoryId(task.title, categoryIds);
    const fallback = categoryIds && !categoryIds.includes(OTHER_CATEGORY_ID) ? categoryIds[0] ?? OTHER_CATEGORY_ID : OTHER_CATEGORY_ID;
    const categoryId = task.categoryId ?? suggested ?? fallback;
    const source: ValueSource = task.categoryId ? (task.sources.categoryId ?? 'user') : suggested ? 'ai' : 'user';
    return {
      ...task,
      durationMinutes: task.durationMinutes ?? null,
      categoryId,
      sources: { ...task.sources, categoryId: source },
      key: `t${counter}`,
      edited: {},
    };
  });
}

/** Applies a user edit; the value now counts as the user's own choice. */
export function editDraft<K extends PlanField | 'title'>(task: DraftTask, field: K, value: DraftTask[K]): DraftTask {
  return { ...task, [field]: value, edited: { ...task.edited, [field]: true }, warnings: [], adjustedNote: undefined };
}

export function shiftTime(time: string | null, deltaMinutes: number) {
  const current = minutesFromTime(time ?? undefined) ?? 9 * 60;
  return timeFromMinutes(Math.min(23 * 60 + 45, Math.max(0, current + deltaMinutes)));
}

export function shiftDate(date: string, deltaDays: number, earliest: string) {
  const next = addLocalDays(date, deltaDays);
  return next < earliest ? earliest : next;
}

/** The source to display: anything the user edited is theirs. */
export function displaySource(task: DraftTask, field: PlanField): ValueSource {
  return task.edited[field] ? 'user' : task.sources[field] ?? 'user';
}

/** Body for POST /api/ai/plan/confirm. */
export function toConfirmPayload(tasks: DraftTask[]) {
  return tasks.map((task) => ({
    title: task.title.trim(),
    description: task.description,
    type: task.type,
    date: task.date,
    startTime: task.startTime,
    durationMinutes: task.durationMinutes,
    priority: task.priority,
    categoryId: task.categoryId,
    deadline: task.deadline,
    original: task.original,
  }));
}

/** Tasks the user has already reviewed, kept as they are when ORDINA re-plans after an answer. */
export function toKeepTasks(tasks: DraftTask[]) {
  return toConfirmPayload(tasks);
}

/** Restores each kept task's edit markers after a re-plan (matched by title). */
export function mergeReplan(previous: DraftTask[], next: Omit<PlanTask, 'categoryId'>[], categoryIds?: string[]): DraftTask[] {
  const byTitle = new Map(previous.map((task) => [task.title.trim().toLowerCase(), task]));
  return toDrafts(next, categoryIds).map((task) => {
    const before = byTitle.get(task.title.trim().toLowerCase());
    return before ? { ...task, categoryId: before.categoryId, sources: before.sources, edited: before.edited } : task;
  });
}

/** Titles of other draft tasks that overlap each task, keyed by task key (shown after the user edits times). */
export function overlapsByTask(tasks: DraftTask[]) {
  const result = new Map<string, string[]>();
  const span = (task: DraftTask) => {
    const start = minutesFromTime(task.startTime ?? undefined);
    // No duration still occupies its starting minute.
    return start === null ? null : [start, start + Math.max(1, task.durationMinutes ?? 0)] as const;
  };
  for (const task of tasks) {
    const own = span(task);
    if (!own) continue;
    const clashes = tasks.filter((other) => {
      if (other.key === task.key || other.date !== task.date) return false;
      const theirs = span(other);
      return theirs !== null && own[0] < theirs[1] && theirs[0] < own[1];
    });
    if (clashes.length) result.set(task.key, clashes.map((other) => other.title));
  }
  return result;
}

export function formatDeadline(deadline: string | null) {
  if (!deadline) return null;
  const [date, time] = deadline.split('T');
  return { date, time: time ?? null };
}
