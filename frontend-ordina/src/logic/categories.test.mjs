// Unit tests for categories. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_CATEGORIES,
  OTHER_CATEGORY_ID,
  fallbackCategoryId,
  legacyCategoryId,
  reorder,
  suggestCategoryId,
  validateCategoryName,
} from './categories.ts';

test('the 8 default categories, with "Other" last', () => {
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.defaultKey),
    ['work', 'study', 'personal', 'health', 'family', 'finance', 'errands', 'other'],
  );
  assert.equal(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size, 8);
  assert.equal(DEFAULT_CATEGORIES.at(-1).id, OTHER_CATEGORY_ID);
});

test('version 1 categories move to the new defaults', () => {
  assert.equal(legacyCategoryId('work'), 'cat-work');
  assert.equal(legacyCategoryId('learning'), 'cat-study');
  assert.equal(legacyCategoryId('database'), 'cat-errands');
  assert.equal(legacyCategoryId(null), OTHER_CATEGORY_ID);
  assert.equal(legacyCategoryId('unknown'), OTHER_CATEGORY_ID);
});

test('category names: 1-30 characters and unique', () => {
  assert.equal(validateCategoryName('  ', []), 'empty');
  assert.equal(validateCategoryName('x'.repeat(31), []), 'tooLong');
  assert.equal(validateCategoryName('x'.repeat(30), []), null);
  assert.equal(validateCategoryName(' work ', ['Work', 'Study']), 'duplicate');
  assert.equal(validateCategoryName('Side   project', ['side project']), 'duplicate');
  assert.equal(validateCategoryName('Church', ['Work']), null);
});

test('deleting a category moves tasks to the chosen one, else "Other"', () => {
  const cats = DEFAULT_CATEGORIES;
  assert.equal(fallbackCategoryId(cats, 'cat-work', 'cat-study'), 'cat-study');
  assert.equal(fallbackCategoryId(cats, 'cat-work'), OTHER_CATEGORY_ID);
  assert.equal(fallbackCategoryId(cats, 'cat-work', 'cat-work'), OTHER_CATEGORY_ID, 'cannot move to itself');
  assert.equal(fallbackCategoryId([{ id: 'a' }, { id: OTHER_CATEGORY_ID }], OTHER_CATEGORY_ID), 'a');
  assert.equal(fallbackCategoryId([{ id: 'a' }], 'a'), null);
});

test('reorder renumbers positions', () => {
  const list = reorder([{ id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }], 2, 0);
  assert.deepEqual(list.map((c) => [c.id, c.position]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.deepEqual(reorder(list, 0, 9).map((c) => c.id), ['c', 'a', 'b'], 'out of range: unchanged');
});

test('suggests a category from the task title', () => {
  assert.equal(suggestCategoryId('Go to the gym'), 'cat-health');
  assert.equal(suggestCategoryId('Team meeting'), 'cat-work');
  assert.equal(suggestCategoryId('Study Python'), 'cat-study');
  assert.equal(suggestCategoryId('Pay the rent'), 'cat-finance');
  assert.equal(suggestCategoryId('Call mom'), 'cat-family');
  assert.equal(suggestCategoryId('Buy groceries'), 'cat-errands');
  assert.equal(suggestCategoryId('Réunion avec le client'), 'cat-work');
  assert.equal(suggestCategoryId('Kujya muri siporo'), 'cat-health');
  assert.equal(suggestCategoryId('Something else'), null);
  assert.equal(suggestCategoryId('Go to the gym', ['cat-work']), null, 'only existing categories');
});
