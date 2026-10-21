// Unit tests for Home search, filter chips and grouping. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categoryCounts, filterByCategory, groupByCategory, searchTasks } from './task-filter.ts';

const label = (id) => ({ exams: 'Exams', work: 'Work', exercise: 'Exercise', hobbies: 'Hobbies' })[id] ?? id;

const tasks = [
  { title: 'Math exam revision', category: 'exams', completed: false },
  { title: 'Team meeting', description: 'Réunion budget', category: 'meetings', completed: false },
  { title: 'Morning run', category: 'exercise', completed: true },
  { title: 'Logo draft', category: 'design', completed: false },
  { title: 'Physics exam', category: 'exams', completed: false },
  { title: 'Read chapter 3', category: 'study', completed: true },
];

test('search matches every word in title, description or category, ignoring case and accents', () => {
  assert.deepEqual(searchTasks(tasks, 'EXAM math', label).map((task) => task.title), ['Math exam revision']);
  assert.deepEqual(searchTasks(tasks, 'reunion', label).map((task) => task.title), ['Team meeting']);
  assert.deepEqual(searchTasks(tasks, 'exercise', label).map((task) => task.title), ['Morning run']);
  assert.equal(searchTasks(tasks, '   ', label).length, tasks.length);
  assert.equal(searchTasks(tasks, 'holiday', label).length, 0);
});

test('chips show the top-level categories in use, most used first; old ids count as their new category', () => {
  assert.deepEqual(categoryCounts(tasks), [
    { id: 'study', count: 3 },
    { id: 'work', count: 1 },
    { id: 'personal', count: 1 },
    { id: 'health', count: 1 },
  ]);
  // "design" (version 1) is now Hobbies, under Personal.
  assert.deepEqual(filterByCategory(tasks, 'personal').map((task) => task.title), ['Logo draft']);
  assert.deepEqual(filterByCategory(tasks, 'study').map((task) => task.title), ['Math exam revision', 'Physics exam', 'Read chapter 3']);
  assert.deepEqual(filterByCategory(tasks, 'exams').length, 2);
  assert.equal(filterByCategory(tasks, null).length, tasks.length);
});

test('tasks are grouped by top-level category in catalogue order, with pending and done counts', () => {
  const groups = groupByCategory(tasks);
  assert.deepEqual(groups.map((group) => group.category), ['work', 'study', 'personal', 'health']);
  assert.deepEqual(groups[1].tasks.map((task) => task.title), ['Math exam revision', 'Physics exam', 'Read chapter 3']);
  assert.deepEqual([groups[1].pending, groups[1].done], [2, 1]);
});
