/** Turns tasks split from a written plan into editable preview drafts (same shape as AI plans). */
import type { Translate } from '@/i18n';
import type { DraftTask, ServerPlanTask, ValueSource } from '@/types/plan';
import { localDateKey } from '@/utils/dates';
import { toDrafts } from '@/utils/plan-draft';
import { minutesFromTime } from '@/utils/task-planning';

import type { ParsedTask } from './parseTasks';

const PART_HINT = { morning: 'task.morningHint', afternoon: 'task.afternoonHint', evening: 'task.eveningHint', night: 'task.nightHint' } as const;

/**
 * Tasks without a time stay Anytime and tasks without a duration have none: nothing is guessed.
 * "In the evening" / "after that" are shown as a note. Categories are suggested from the title.
 */
export function parsedToDrafts(tasks: ParsedTask[], t: Translate, categoryIds?: string[], defaultDuration: number | null = null): DraftTask[] {
  return toDrafts(
    tasks.map((task): ServerPlanTask => {
      const sources = {
        date: 'user' as ValueSource,
        startTime: 'user' as ValueSource,
        durationMinutes: (task.durationMinutes ? 'user' : 'ai') as ValueSource,
        priority: 'user' as ValueSource,
      };
      const durationMinutes = task.durationMinutes ?? defaultDuration;
      const notes = [
        task.partOfDay ? t(PART_HINT[task.partOfDay]) : null,
        task.after ? t('task.afterHint', { title: task.after }) : null,
      ].filter(Boolean);
      return {
        title: task.title,
        description: null,
        type: 'task',
        date: task.date,
        startTime: task.startTime,
        durationMinutes,
        priority: task.priority,
        deadline: null,
        timeWindow: task.partOfDay,
        sources,
        note: null,
        adjustedNote: notes.length ? notes.join(' · ') : undefined,
        warnings: [],
        original: { startTime: task.startTime, durationMinutes, priority: task.priority, sources },
      };
    }),
    categoryIds,
  );
}

/** The task's day or start time is already over (checked live, so changing the time clears it). */
export function isTimeOver(task: Pick<DraftTask, 'date' | 'startTime'>, now = new Date()) {
  const today = localDateKey(now);
  if (task.date < today) return true;
  if (task.date !== today || !task.startTime) return false;
  return (minutesFromTime(task.startTime) ?? 0) < now.getHours() * 60 + now.getMinutes();
}
