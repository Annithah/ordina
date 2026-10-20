// Unit tests for the category catalogue. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORIES, CATEGORY_GROUPS, focusGroups, knownCategory, normalizeCategory, splitCategories } from './categories.ts';

test('every category belongs to a known group and ids are unique', () => {
  const groups = new Set(CATEGORY_GROUPS.map((group) => group.id));
  assert.equal(new Set(CATEGORIES.map((category) => category.id)).size, CATEGORIES.length);
  for (const category of CATEGORIES) assert.ok(groups.has(category.group), category.id);
  for (const group of groups) assert.ok(CATEGORIES.some((category) => category.group === group), group);
});

test('version 1 ids are renamed, unknown values are rejected or fall back to Personal', () => {
  assert.equal(knownCategory('design'), 'creative');
  assert.equal(knownCategory('database'), 'errands');
  assert.equal(knownCategory(' Exams '), 'exams');
  assert.equal(knownCategory('banana'), null);
  assert.equal(normalizeCategory('banana'), 'personal');
  assert.equal(normalizeCategory(null), 'personal');
});

test('onboarding focus answers become the user\'s own category groups', () => {
  assert.deepEqual(focusGroups({ focus: ['study', 'health'] }), ['education', 'health']);
  // Skipped the question: every group counts as theirs.
  assert.equal(focusGroups({}).length, CATEGORY_GROUPS.length);
  const { mine, others } = splitCategories(['education']);
  assert.ok(mine.every((category) => category.group === 'education'));
  assert.equal(mine.length + others.length, CATEGORIES.length);
});
