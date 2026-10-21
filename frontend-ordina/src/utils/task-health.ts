import type { Task } from '@/store/tasks-store';
import { translate } from '@/i18n/translations';
import { dashboardStatusAt, taskHealthAt, type DashboardStatus, type TaskHealth } from '@/features/dashboard';

// The status rules live in features/dashboard.ts (shared with the dashboard counts and tests).
export type { DashboardStatus, TaskHealth } from '@/features/dashboard';

export function taskHealth(task: Task, now = new Date()): TaskHealth {
  return taskHealthAt(task, now);
}

export function dashboardStatus(task: Task, now = new Date()): DashboardStatus {
  return dashboardStatusAt(task, now);
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
