// Unit tests for the Home dashboard cards and the Tasks lists they open. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DASHBOARD_FILTERS, dashboardCounts, dashboardStatusAt, dashboardTasks, isDashboardFilter } from './dashboard.ts';
import { dateGroupedRows } from './task-sections.ts';

// 21 Oct 2026, 15:00.
const now = new Date(2026, 9, 21, 15, 0);

const task = (id, extra) => ({ id, title: id, status: 'pending', completed: false, ...extra });

const tasks = [
  task('done-old', { dueDate: '2026-10-01', completed: true, status: 'completed' }),
  task('done-new', { dueDate: '2026-10-20', completed: true, status: 'completed' }),
  task('done-undated', { completed: true, status: 'completed' }),
  task('late-week', { dueDate: '2026-10-14' }),
  task('late-yesterday', { dueDate: '2026-10-20', startTime: '09:00' }),
  task('late-today', { dueDate: '2026-10-21', startTime: '08:00', duration: '1h' }),
  task('late-deadline', { dueDate: '2026-10-25', deadline: '2026-10-21T12:00' }),
  task('started-today', { dueDate: '2026-10-21', startTime: '18:00', status: 'in_progress' }),
  task('started-friday', { dueDate: '2026-10-23', status: 'in_progress' }),
  task('started-undated', { status: 'in_progress' }),
  // Started this morning and still going: the user's own "in progress" wins over the clock.
  task('started-running', { dueDate: '2026-10-21', startTime: '08:00', status: 'in_progress' }),
  task('todo-tomorrow', { dueDate: '2026-10-22' }),
  task('todo-tonight', { dueDate: '2026-10-21', startTime: '20:00' }),
];

test('each card count is exactly the number of tasks its list shows', () => {
  const counts = dashboardCounts(tasks, now);
  for (const filter of DASHBOARD_FILTERS) {
    assert.equal(counts[filter], dashboardTasks(tasks, filter, now).length, filter);
  }
  assert.deepEqual({ completed: counts.completed, inProgress: counts.inProgress, overdue: counts.overdue }, { completed: 3, inProgress: 4, overdue: 4 });
  // Every task is in exactly one bucket.
  assert.equal(counts.completed + counts.inProgress + counts.overdue + counts.todo, tasks.length);
});

test('completed: newest first, undated last', () => {
  assert.deepEqual(dashboardTasks(tasks, 'completed', now).map((item) => item.id), ['done-new', 'done-old', 'done-undated']);
});

test('overdue: oldest first, including passed times and deadlines', () => {
  assert.deepEqual(dashboardTasks(tasks, 'overdue', now).map((item) => item.id), ['late-week', 'late-yesterday', 'late-today', 'late-deadline']);
});

test('in progress: started tasks that are not overdue, soonest first', () => {
  assert.deepEqual(dashboardTasks(tasks, 'inProgress', now).map((item) => item.id), ['started-running', 'started-today', 'started-friday', 'started-undated']);
  assert.equal(dashboardStatusAt(tasks.find((item) => item.id === 'todo-tonight'), now), 'todo');
});

test('the filtered list is grouped under date headers, undated under "No date"', () => {
  const rows = dateGroupedRows(dashboardTasks(tasks, 'inProgress', now));
  assert.deepEqual(rows.map((row) => (row.kind === 'task' ? row.task.id : row.kind === 'day' ? row.date : row.kind)), [
    '2026-10-21', 'started-running', 'started-today', '2026-10-23', 'started-friday', 'noDate', 'started-undated',
  ]);
});

test('only the three card filters are accepted from navigation', () => {
  assert.ok(isDashboardFilter('overdue'));
  assert.ok(!isDashboardFilter('todo'));
  assert.ok(!isDashboardFilter(undefined));
});
