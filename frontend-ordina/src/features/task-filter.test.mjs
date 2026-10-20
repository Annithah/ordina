// Unit tests for Home search, filter chips and grouping. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categoryCounts, filterByCategory, groupByCategory, searchTasks } from './task-filter.ts';

const label = (id) => ({ exams: 'Exams', work: 'Work', fitness: 'Exercise & fitness', creative: 'Creative work' })[id] ?? id;

const tasks = [
  { title: 'Math exam revision', category: 'exams', completed: false },
  { title: 'Team meeting', description: 'Réunion budget', category: 'work', completed: false },
  { title: 'Morning run', category: 'fitness', completed: true },
  { title: 'Logo draft', category: 'design', completed: false },
  { title: 'Physics exam', category: 'exams', completed: false },
];

test('search matches every word in title, description or category, ignoring case and accents', () => {
  assert.deepEqual(searchTasks(tasks, 'EXAM math', label).map((task) => task.title), ['Math exam revision']);
  assert.deepEqual(searchTasks(tasks, 'reunion', label).map((task) => task.title), ['Team meeting']);
  assert.deepEqual(searchTasks(tasks, 'fitness', label).map((task) => task.title), ['Morning run']);
  assert.equal(searchTasks(tasks, '   ', label).length, tasks.length);
  assert.equal(searchTasks(tasks, 'holiday', label).length, 0);
});

test('chips show the categories in use, most used first; old ids count as their new category', () => {
  assert.deepEqual(categoryCounts(tasks), [
    { id: 'exams', count: 2 },
    { id: 'work', count: 1 },
    { id: 'fitness', count: 1 },
    { id: 'creative', count: 1 },
  ]);
  assert.deepEqual(filterByCategory(tasks, 'creative').map((task) => task.title), ['Logo draft']);
  assert.equal(filterByCategory(tasks, null).length, tasks.length);
});

test('tasks are grouped by category in catalogue order, keeping their order inside a group', () => {
  const groups = groupByCategory(tasks);
  assert.deepEqual(groups.map((group) => group.category), ['work', 'exams', 'fitness', 'creative']);
  assert.deepEqual(groups[1].tasks.map((task) => task.title), ['Math exam revision', 'Physics exam']);
});
