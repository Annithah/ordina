// Unit tests for the category system. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_CATEGORIES,
  OTHER_ID,
  buildTree,
  defaultRecords,
  filterTasksByCategories,
  learnFromChoice,
  migrateCategoryId,
  pickerOrder,
  planDelete,
  planMerge,
  reorder,
  rootOf,
  significantWords,
  suggestCategory,
  validateCategoryName,
  withChildren,
} from './category-tree.ts';
import { categoryInfo, focusCategories, knownCategory, normalizeCategory, setCategoryRegistry } from './categories.ts';

const names = { work: 'Work', meetings: 'Meetings', study: 'Study', exams: 'Exams', other: 'Other' };
const nameOf = (record) => record.name || names[record.id] || record.id;

function custom(id, parentId = null, extra = {}) {
  return {
    id, name: id, color: '#5C4DF2', icon: 'star-outline', parentId, sortOrder: 99, isArchived: false,
    isDefault: false, isPinned: false, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z', deletedAt: null, ...extra,
  };
}

test('defaults: 8 categories with example subcategories, unique ids, Other last', () => {
  const records = defaultRecords();
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  const tree = buildTree(records);
  assert.deepEqual(tree.map((node) => node.id), ['work', 'study', 'personal', 'health', 'family', 'finance', 'spiritual', 'other']);
  assert.deepEqual(tree[1].children.map((child) => child.id), ['classes', 'assignments', 'exams', 'reading']);
  assert.equal(DEFAULT_CATEGORIES.at(-1).id, OTHER_ID);
  assert.ok(records.every((record) => record.isDefault && !record.name));
});

test('migration: old category ids move to the new categories, nothing becomes empty', () => {
  assert.equal(migrateCategoryId('work'), 'work');
  assert.equal(migrateCategoryId('exams'), 'exams');
  assert.equal(migrateCategoryId('homework'), 'assignments');
  assert.equal(migrateCategoryId('health'), 'medical');
  assert.equal(migrateCategoryId('fitness'), 'exercise');
  assert.equal(migrateCategoryId('design'), 'hobbies');
  assert.equal(migrateCategoryId('faith'), 'spiritual');
  assert.equal(migrateCategoryId(null), OTHER_ID);
  assert.equal(migrateCategoryId('banana'), OTHER_ID);
});

test('names: 1-30 characters, unique within the same parent only', () => {
  const all = [...defaultRecords(), custom('sub', 'work', { name: 'Clients' })];
  assert.equal(validateCategoryName('  ', null, all, nameOf), 'empty');
  assert.equal(validateCategoryName('x'.repeat(31), null, all, nameOf), 'tooLong');
  assert.equal(validateCategoryName('work', null, all, nameOf), 'duplicate');
  assert.equal(validateCategoryName('Clients', 'work', all, nameOf), 'duplicate');
  assert.equal(validateCategoryName('Clients', 'study', all, nameOf), null);
  // Renaming a category to its own name is fine.
  assert.equal(validateCategoryName('Work', null, all, nameOf, 'work'), null);
});

test('archived categories leave the tree and pickers; their subcategories too', () => {
  const all = defaultRecords().map((record) => (record.id === 'study' ? { ...record, isArchived: true } : record));
  assert.ok(!buildTree(all).some((node) => node.id === 'study'));
  assert.ok(buildTree(all, { includeArchived: true }).some((node) => node.id === 'study'));
  const { recent } = pickerOrder(all, ['exams', 'work']);
  assert.deepEqual(recent.map((record) => record.id), ['work']);
});

test('pinned first, then recently used', () => {
  const all = defaultRecords().map((record) => (record.id === 'finance' ? { ...record, isPinned: true } : record));
  const { pinned, recent } = pickerOrder(all, ['finance', 'exams', 'exams', 'calls']);
  assert.deepEqual(pinned.map((record) => record.id), ['finance']);
  assert.deepEqual(recent.map((record) => record.id), ['exams', 'calls']);
});

test('deleting moves the tasks (category and subcategories) or deletes them only when asked', () => {
  const all = defaultRecords();
  assert.deepEqual(planDelete('study', all, { moveTo: 'other' }), { removeIds: ['study', 'classes', 'assignments', 'exams', 'reading'], moveTasksTo: 'other' });
  assert.deepEqual(planDelete('exams', all, { deleteTasks: true }), { removeIds: ['exams'], moveTasksTo: null });
  assert.throws(() => planDelete('study', all, { moveTo: 'exams' }), /not being deleted/);
  assert.throws(() => planDelete(OTHER_ID, all, { moveTo: 'work' }), /cannot be deleted/);
});

test('merging: tasks move to the target; subcategories survive under a top-level target', () => {
  const all = defaultRecords();
  assert.deepEqual(planMerge('family', 'personal', all), { moveTaskIds: ['family'], target: 'personal', reparentIds: ['calls', 'events'], removeIds: ['family'] });
  // Into a subcategory (one level only): everything moves there.
  assert.deepEqual(planMerge('spiritual', 'events', all), {
    moveTaskIds: ['spiritual', 'prayer', 'worship'], target: 'events', reparentIds: [], removeIds: ['spiritual', 'prayer', 'worship'],
  });
  assert.throws(() => planMerge('work', 'work', all));
  assert.throws(() => planMerge('work', 'meetings', all), /own subcategory/);
});

test('drag and drop reorder gives new sort orders', () => {
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 3, 0).map((item) => item.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(reorder(['a', 'b', 'c'], 0, 9).map((item) => item.id), ['b', 'c', 'a']);
  assert.deepEqual(reorder(['a', 'b'], 0, 1).map((item) => item.sortOrder), [0, 1]);
});

test('filtering by a parent includes all of its subcategories', () => {
  const all = [...defaultRecords(), custom('labs', 'study')];
  const tasks = [
    { id: 1, category: 'exams' }, { id: 2, category: 'labs' }, { id: 3, category: 'work' }, { id: 4, category: 'study' },
  ];
  assert.deepEqual(filterTasksByCategories(tasks, ['study'], all).map((task) => task.id), [1, 2, 4]);
  assert.deepEqual(filterTasksByCategories(tasks, ['exams', 'work'], all).map((task) => task.id), [1, 3]);
  assert.equal(filterTasksByCategories(tasks, [], all).length, 4);
  assert.deepEqual(withChildren('family', all), ['family', 'calls', 'events']);
  assert.equal(rootOf('labs', all), 'study');
  assert.equal(rootOf('work', all), 'work');
});

test('suggestions in English, Kinyarwanda and French', () => {
  const cases = {
    'Gym at 6pm': 'exercise',
    'Finish the statistics assignment': 'assignments',
    'Pay rent': 'bills',
    'Call the dentist': 'medical',
    'Call mom tonight': 'calls',
    'Team meeting with Sarah': 'meetings',
    'Revise for the maths exam': 'exams',
    'Gusenga mu gitondo': 'prayer',
    'Kwishyura fagitire y\'umuriro': 'bills',
    'Ikizamini cy\'imibare': 'exams',
    'Inama y\'abakozi': 'meetings',
    'Réunion avec l\'équipe': 'meetings',
    'Faire le ménage': 'home',
    'Payer le loyer': 'bills',
    'Fix the login bug': 'work',
    'Book a hotel for the trip': 'personal',
  };
  for (const [title, expected] of Object.entries(cases)) assert.equal(suggestCategory(title), expected, title);
  assert.equal(suggestCategory('Something else'), null);
  assert.equal(suggestCategory('Something else', { type: 'exercise' }), 'exercise');
});

test('suggestions skip deleted categories and fall back to the parent', () => {
  const usable = (id) => id !== 'exercise';
  assert.equal(suggestCategory('Gym at 6pm', { usable }), 'health');
  assert.equal(suggestCategory('Gym at 6pm', { usable: () => false }), null);
});

test('learning: when the user changes a suggestion, their choice wins next time', () => {
  assert.equal(suggestCategory('Gym with Eric'), 'exercise');
  const learned = learnFromChoice('Gym with Eric', 'exercise', 'family');
  assert.deepEqual(learned, { gym: 'family', eric: 'family' });
  assert.equal(suggestCategory('Gym with Eric on Friday', { learned }), 'family');
  assert.deepEqual(learnFromChoice('Gym', 'exercise', 'exercise'), {});
  assert.deepEqual(significantWords('Pay the rent at 5 PM tomorrow'), ['pay', 'rent']);
});

test('runtime registry: old ids are recognised, custom ids kept, unknown values become Other', () => {
  setCategoryRegistry([...defaultRecords(), custom('labs', 'study')]);
  assert.equal(knownCategory('fitness'), 'exercise');
  assert.equal(knownCategory('labs'), 'labs');
  assert.equal(knownCategory('banana'), null);
  assert.equal(normalizeCategory(''), OTHER_ID);
  assert.equal(normalizeCategory('Banana Split'), OTHER_ID);
  // A custom id not loaded yet stays on the task.
  assert.equal(normalizeCategory('a1b2-c3'), 'a1b2-c3');
  assert.equal(categoryInfo('a1b2-c3').id, OTHER_ID);
  assert.equal(categoryInfo('labs').parentId, 'study');
  assert.deepEqual(focusCategories({ focus: ['social', 'study'] }), ['study', 'family', 'spiritual']);
  assert.deepEqual(focusCategories({}), []);
});
