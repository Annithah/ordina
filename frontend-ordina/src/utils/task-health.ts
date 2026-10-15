import type { Task } from '@/store/tasks-store';
import { localDateKey } from '@/utils/dates';

/**
 * Dashboard status for a task:
 * - completed  → green
 * - inProgress → yellow (started, or due today and still on time)
 * - overdue    → red (past its due date/time and not completed)
 * - planned    → neutral (scheduled for a future day)
 */
export type TaskHealth = 'completed' | 'inProgress' | 'overdue' | 'planned';

function minutesNow(now: Date) {
  return now.getHours() * 60 + now.getMinutes();
}

function endMinutes(task: Task) {
  if (!task.startTime || !/^\d{2}:\d{2}$/.test(task.startTime)) return null;
  const [h, m] = task.startTime.split(':').map(Number);
  const hours = /(\d+)\s*h/.exec(task.duration ?? '');
  const mins = /(\d+)\s*m/.exec(task.duration ?? '');
  const length = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : hours ? 0 : 60);
  return h * 60 + m + length;
}

export function taskHealth(task: Task, now = new Date()): TaskHealth {
  if (task.completed) return 'completed';
  const today = localDateKey(now);
  if (task.dueDate && task.dueDate < today) return 'overdue';
  if (task.dueDate === today) {
    const end = endMinutes(task);
    if (end !== null && end < minutesNow(now) && task.status !== 'in_progress') return 'overdue';
    return 'inProgress';
  }
  if (task.status === 'in_progress') return 'inProgress';
  return 'planned';
}

/** The three states the task list shows: pending, completed, or overdue. */
export type TaskStatusLabel = 'pending' | 'completed' | 'overdue';

export function taskStatus(task: Task, now = new Date()): TaskStatusLabel {
  const health = taskHealth(task, now);
  return health === 'completed' || health === 'overdue' ? health : 'pending';
}

export const STATUS_LABEL: Record<TaskStatusLabel, string> = {
  pending: 'Pending',
  completed: 'Completed',
  overdue: 'Overdue',
};

export function healthColor(health: TaskHealth, theme: { success: string; warning: string; danger: string; textSecondary: string }) {
  switch (health) {
    case 'completed':
      return theme.success;
    case 'inProgress':
      return theme.warning;
    case 'overdue':
      return theme.danger;
    default:
      return theme.textSecondary;
  }
}

export const HEALTH_LABEL: Record<TaskHealth, string> = {
  completed: 'Completed',
  inProgress: 'In progress',
  overdue: 'Incomplete / overdue',
  planned: 'Planned',
};

export function summarize(tasks: Task[], now = new Date()) {
  const counts = { completed: 0, inProgress: 0, overdue: 0, planned: 0 };
  for (const task of tasks) counts[taskHealth(task, now)] += 1;
  return counts;
}
