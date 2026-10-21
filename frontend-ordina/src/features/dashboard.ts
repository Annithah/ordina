/**
 * Task status for the Home dashboard and its filtered Tasks lists. The card counts and the
 * lists come from the same function (dashboardTasks), so they can never disagree. Pure.
 */

export type HealthTask = {
  id: string;
  title: string;
  dueDate?: string;
  startTime?: string;
  duration?: string;
  deadline?: string | null;
  status: string;
  completed: boolean;
  updatedAt?: string;
};

/**
 * - completed  → done
 * - overdue    → not done, and its day, time or deadline has passed
 * - inProgress → started (Start ▶) or due today and still on time
 * - planned    → scheduled for later
 */
export type TaskHealth = 'completed' | 'inProgress' | 'overdue' | 'planned';

/** Completed, overdue, in progress (the user pressed Start ▶), or still to do. */
export type DashboardStatus = 'completed' | 'inProgress' | 'overdue' | 'todo';

export type DashboardFilter = 'completed' | 'inProgress' | 'overdue';

export const DASHBOARD_FILTERS: DashboardFilter[] = ['completed', 'inProgress', 'overdue'];

export function isDashboardFilter(value: unknown): value is DashboardFilter {
  return value === 'completed' || value === 'inProgress' || value === 'overdue';
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function endMinutes(task: HealthTask) {
  if (!task.startTime || !/^\d{2}:\d{2}$/.test(task.startTime)) return null;
  const [h, m] = task.startTime.split(':').map(Number);
  const hours = /(\d+)\s*h/.exec(task.duration ?? '');
  const mins = /(\d+)\s*m/.exec(task.duration ?? '');
  const length = (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : hours ? 0 : 60);
  return h * 60 + m + length;
}

function deadlinePassed(task: HealthTask, now: Date) {
  if (!task.deadline) return false;
  const [date, time] = task.deadline.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime() < now.getTime();
}

export function taskHealthAt(task: HealthTask, now = new Date()): TaskHealth {
  if (task.completed) return 'completed';
  if (deadlinePassed(task, now)) return 'overdue';
  const today = dateKey(now);
  if (task.dueDate && task.dueDate < today) return 'overdue';
  if (task.dueDate === today) {
    const end = endMinutes(task);
    if (end !== null && end < now.getHours() * 60 + now.getMinutes() && task.status !== 'in_progress') return 'overdue';
    return 'inProgress';
  }
  if (task.status === 'in_progress') return 'inProgress';
  return 'planned';
}

/** Unlike taskHealth, a task due today is only "in progress" once the user has started it. */
export function dashboardStatusAt(task: HealthTask, now = new Date()): DashboardStatus {
  if (task.completed) return 'completed';
  if (taskHealthAt(task, now) === 'overdue') return 'overdue';
  if (task.status === 'in_progress') return 'inProgress';
  return 'todo';
}

const byDateTime = (a: HealthTask, b: HealthTask) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')
  || (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
  || a.title.localeCompare(b.title);

/**
 * The tasks behind a dashboard card, in the order the list shows them:
 * Completed newest first, Overdue oldest first, In progress soonest first.
 */
export function dashboardTasks<T extends HealthTask>(tasks: T[], filter: DashboardFilter, now = new Date()): T[] {
  const chosen = tasks.filter((task) => dashboardStatusAt(task, now) === filter);
  if (filter === 'completed') {
    // Undated completed tasks go last.
    return chosen.sort((a, b) => Number(!a.dueDate) - Number(!b.dueDate) || byDateTime(b, a) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }
  return chosen.sort(byDateTime);
}

/** The numbers on the Home cards: exactly the length of each filtered list. */
export function dashboardCounts(tasks: HealthTask[], now = new Date()) {
  const completed = dashboardTasks(tasks, 'completed', now).length;
  const inProgress = dashboardTasks(tasks, 'inProgress', now).length;
  const overdue = dashboardTasks(tasks, 'overdue', now).length;
  return { completed, inProgress, overdue, todo: tasks.length - completed - inProgress - overdue };
}
