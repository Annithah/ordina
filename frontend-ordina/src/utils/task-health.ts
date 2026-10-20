import type { Task } from '@/store/tasks-store';
import { translate } from '@/i18n/translations';
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

function deadlinePassed(task: Task, now: Date) {
  if (!task.deadline) return false;
  const [date, time] = task.deadline.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime() < now.getTime();
}

export function taskHealth(task: Task, now = new Date()): TaskHealth {
  if (task.completed) return 'completed';
  if (deadlinePassed(task, now)) return 'overdue';
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

/**
 * Dashboard state of a task: completed, overdue (its day or time has passed), in progress
 * (the user pressed Start), or still to do. Unlike taskHealth, a task due today is only
 * "in progress" once it has been started.
 */
export type DashboardStatus = 'completed' | 'inProgress' | 'overdue' | 'todo';

export function dashboardStatus(task: Task, now = new Date()): DashboardStatus {
  if (task.completed) return 'completed';
  if (taskHealth(task, now) === 'overdue') return 'overdue';
  if (task.status === 'in_progress') return 'inProgress';
  return 'todo';
}

/** The three states the task list shows: pending, completed, or overdue. */
export type TaskStatusLabel = 'pending' | 'completed' | 'overdue';

export function taskStatus(task: Task, now = new Date()): TaskStatusLabel {
  const health = taskHealth(task, now);
  return health === 'completed' || health === 'overdue' ? health : 'pending';
}

export function statusLabel(status: TaskStatusLabel) {
  return translate(status === 'pending' ? 'home.todo' : `home.${status}`);
}

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

export function healthLabel(health: TaskHealth) {
  return translate(health === 'overdue' ? 'home.incomplete' : `home.${health}`);
}

export function summarize(tasks: Task[], now = new Date()) {
  const counts = { completed: 0, inProgress: 0, overdue: 0, planned: 0 };
  for (const task of tasks) counts[taskHealth(task, now)] += 1;
  return counts;
}
