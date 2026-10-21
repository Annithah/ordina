// Every language must have every English text, nothing extra, and the same {placeholders}. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ar } from './locales/ar.ts';
import { de } from './locales/de.ts';
import { en } from './locales/en.ts';
import { es } from './locales/es.ts';
import { fr } from './locales/fr.ts';
import { hi } from './locales/hi.ts';
import { pt } from './locales/pt.ts';
import { sw } from './locales/sw.ts';
import { zh } from './locales/zh.ts';

function flatten(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`));
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const english = new Map(flatten(en));

for (const [id, tree] of Object.entries({ fr, es, pt, de, sw, ar, zh, hi })) {
  test(`${id}: complete, nothing extra, same placeholders`, () => {
    const texts = new Map(flatten(tree));
    const missing = [...english.keys()].filter((key) => !texts.has(key));
    const extra = [...texts.keys()].filter((key) => !english.has(key));
    assert.deepEqual(missing, [], `missing in ${id}`);
    assert.deepEqual(extra, [], `unknown keys in ${id}`);
    for (const [key, text] of texts) {
      assert.ok(text.trim(), `${id}.${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english.get(key)), `${id}.${key} placeholders`);
    }
  });
}
