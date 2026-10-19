// Translations: no missing keys in any language, and dates/times in the selected language.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDay, formatDuration, formatLongDate, formatMoment, formatTime } from './format.ts';
import { LANGUAGES, keyPaths, pickLocale, translateIn, translations } from './index.ts';

const english = keyPaths(translations.en).sort();

for (const { id } of LANGUAGES) {
  test(`${id}: has every English key and no extra keys`, () => {
    const keys = keyPaths(translations[id]).sort();
    const missing = english.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !english.includes(key));
    assert.deepEqual(missing, [], `missing in ${id}`);
    assert.deepEqual(extra, [], `extra in ${id}`);
  });

  test(`${id}: no empty texts, and the same {placeholders} as English`, () => {
    for (const key of english) {
      const text = translateIn(id, key);
      assert.ok(text.trim(), `${id}.${key} is empty`);
      const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(names(text), names(translateIn('en', key)), `${id}.${key} placeholders`);
    }
  });

  test(`${id}: 12 months and 7 weekdays`, () => {
    assert.equal(translateIn(id, 'dates.months').split(',').length, 12);
    assert.equal(translateIn(id, 'dates.monthsShort').split(',').length, 12);
    for (const key of ['weekdays', 'weekdaysShort', 'weekdaysNarrow']) assert.equal(translateIn(id, `dates.${key}`).split(',').length, 7);
  });
}

test('the phone language is used when supported, else English', () => {
  assert.equal(pickLocale(['fr-FR']), 'fr');
  assert.equal(pickLocale(['rw-RW', 'en']), 'rw');
  assert.equal(pickLocale(['de-DE', 'fr']), 'fr');
  assert.equal(pickLocale(['sw-KE']), 'en');
  assert.equal(pickLocale([]), 'en');
});

test('plural forms and placeholders', () => {
  assert.equal(translateIn('en', 'home.results', { count: 1 }), '1 task');
  assert.equal(translateIn('en', 'home.results', { count: 4 }), '4 tasks');
  assert.equal(translateIn('fr', 'home.results', { count: 4 }), '4 tâches');
  assert.equal(translateIn('fr', 'no.such.key'), 'no.such.key');
});

test('dates and times in the selected language', () => {
  const now = new Date(2026, 9, 19, 9, 0);
  assert.equal(formatLongDate('en', '2026-10-19', now), 'Monday 19 October');
  assert.equal(formatLongDate('fr', '2026-10-19', now), 'lundi 19 octobre');
  assert.equal(formatLongDate('rw', '2026-10-19', now), 'Ku wa mbere, 19 Ukwakira');
  assert.equal(formatLongDate('en', '2027-01-04', now), 'Monday 4 January 2027');
  assert.equal(formatDay('fr', '2026-10-20', now), 'Demain');
  assert.equal(formatDay('rw', '2026-10-19', now), 'Uyu munsi');
  assert.equal(formatTime('en', '14:30'), '2:30 PM');
  assert.equal(formatTime('en', '00:05'), '12:05 AM');
  assert.equal(formatTime('fr', '14:30'), '14:30');
  assert.equal(formatDuration('en', 90), '1 h 30 min');
  assert.equal(formatDuration('rw', 30), 'iminota 30');
  assert.equal(formatDuration('en', null), '');
  assert.equal(formatMoment('en', new Date(2026, 9, 19, 14, 32).toISOString(), now), 'today 2:32 PM');
  assert.equal(formatMoment('fr', new Date(2026, 9, 19, 14, 32).toISOString(), now), "aujourd'hui à 14:32");
});
