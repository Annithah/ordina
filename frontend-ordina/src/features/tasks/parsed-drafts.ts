/** Turns tasks split from a written plan into editable preview drafts (same shape as AI plans). */
import type { DraftTask, PlanTask, ValueSource } from '@/types/plan';
import { localDateKey } from '@/utils/dates';
import { toDrafts } from '@/utils/plan-draft';
import { minutesFromTime } from '@/utils/task-planning';

import { DEFAULT_DURATION_MINUTES, type ParsedTask } from './parseTasks';

export function parsedToDrafts(tasks: ParsedTask[]): DraftTask[] {
  return toDrafts(
    tasks.map((task): PlanTask => {
      const sources: PlanTask['sources'] = {
        date: 'user',
        startTime: (task.timeSuggested ? 'ai' : 'user') as ValueSource,
        durationMinutes: (task.durationMinutes ? 'user' : 'ai') as ValueSource,
        priority: 'user',
      };
      const durationMinutes = task.durationMinutes ?? DEFAULT_DURATION_MINUTES;
      return {
        title: task.title,
        description: null,
        type: 'task',
        date: task.date,
        startTime: task.startTime,
        durationMinutes,
        priority: task.priority,
        deadline: null,
        timeWindow: null,
        sources,
        note: null,
        adjustedNote: task.after ? `After “${task.after}”` : undefined,
        warnings: [],
        original: { startTime: task.startTime, durationMinutes, priority: task.priority, sources },
      };
    }),
  );
}

/** The task's day or start time is already over (checked live, so changing the time clears it). */
export function isTimeOver(task: Pick<DraftTask, 'date' | 'startTime'>, now = new Date()) {
  const today = localDateKey(now);
  if (task.date < today) return true;
  if (task.date !== today || !task.startTime) return false;
  return (minutesFromTime(task.startTime) ?? 0) < now.getHours() * 60 + now.getMinutes();
}
