// Unit tests for the Tasks page sections. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTaskSections, openTasksByDay, sectionOf } from './task-sections.ts';

const today = '2026-10-21';
const notOverdue = () => false;

const tasks = [
  { id: 'past', title: 'Hand in lab report', dueDate: '2026-10-18', completed: false },
  { id: 'today-any', title: 'Buy bread', dueDate: today, completed: false },
  { id: 'today-late', title: 'Gym', dueDate: today, startTime: '18:00', completed: false },
  { id: 'today-early', title: 'Standup', dueDate: today, startTime: '09:00', completed: false },
  { id: 'tomorrow', title: 'Call mom', dueDate: '2026-10-22', completed: false },
  { id: 'next-week-b', title: 'Exam', dueDate: '2026-10-29', startTime: '08:00', completed: false },
  { id: 'next-week-a', title: 'Dentist', dueDate: '2026-10-27', completed: false },
  { id: 'no-date', title: 'Learn guitar', completed: false },
  { id: 'done-old', title: 'Pay rent', dueDate: '2026-10-01', completed: true },
  { id: 'done-new', title: 'Read chapter', dueDate: '2026-10-20', completed: true },
];

const ids = (section) => section.data.filter((row) => row.kind === 'task').map((row) => row.task.id);

test('every task appears exactly once, in the right section', () => {
  const sections = buildTaskSections(tasks, { today, isOverdue: notOverdue });
  assert.deepEqual(sections.map((section) => section.id), ['overdue', 'today', 'tomorrow', 'upcoming', 'noDate', 'completed']);
  const all = sections.flatMap(ids);
  assert.equal(all.length, tasks.length);
  assert.equal(new Set(all).size, tasks.length);
  const byId = Object.fromEntries(sections.map((section) => [section.id, ids(section)]));
  assert.deepEqual(byId.overdue, ['past']);
  assert.deepEqual(byId.tomorrow, ['tomorrow']);
  assert.deepEqual(byId.noDate, ['no-date']);
  for (const section of sections) assert.equal(section.count, ids(section).length);
});

test('today: Anytime tasks first, then timed tasks in time order', () => {
  const todaySection = buildTaskSections(tasks, { today, isOverdue: notOverdue }).find((section) => section.id === 'today');
  assert.deepEqual(todaySection.data.map((row) => (row.kind === 'task' ? row.task.id : row.kind)), [
    'anytime', 'today-any', 'scheduled', 'today-early', 'today-late',
  ]);
});

test('upcoming is grouped by date, soonest first; completed is newest first', () => {
  const sections = buildTaskSections(tasks, { today, isOverdue: notOverdue });
  const upcoming = sections.find((section) => section.id === 'upcoming');
  assert.deepEqual(upcoming.data.map((row) => (row.kind === 'day' ? row.date : row.task.id)), [
    '2026-10-27', 'next-week-a', '2026-10-29', 'next-week-b',
  ]);
  assert.deepEqual(ids(sections.find((section) => section.id === 'completed')), ['done-new', 'done-old']);
});

test('a task due today whose time has passed is overdue; empty sections are left out', () => {
  const late = { id: 'late', title: 'Morning walk', dueDate: today, startTime: '06:00', completed: false };
  assert.equal(sectionOf(late, today, (task) => task.id === 'late'), 'overdue');
  const sections = buildTaskSections([late], { today, isOverdue: (task) => task.id === 'late' });
  assert.deepEqual(sections.map((section) => section.id), ['overdue']);
  assert.deepEqual(buildTaskSections([], { today, isOverdue: notOverdue }), []);
});

test('calendar dots count open tasks per day', () => {
  const dots = openTasksByDay(tasks);
  assert.equal(dots.get(today), 3);
  assert.equal(dots.get('2026-10-01'), undefined);
});
