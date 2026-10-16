// Unit tests for the offline task splitter. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PARSED_TITLE_MAX, parseTasks } from './parseTasks.ts';

// Friday 16 October 2026, 07:00 on the phone.
const NOW = new Date(2026, 9, 16, 7, 0);
const brief = (tasks) => tasks.map((t) => [t.title, t.date, t.startTime, t.durationMinutes, t.priority]);

test('the example paragraph becomes 6 organised tasks', () => {
  const tasks = parseTasks(
    'Today I will study Python at 8 AM for two hours, then I have a team meeting at 2 PM. In the evening I need to go to the gym. '
      + 'Tomorrow I will call my mentor at 7 PM and after that prepare my presentation. On Friday I must submit the report, it is urgent.',
    NOW,
  );
  assert.deepEqual(brief(tasks), [
    ['Study Python', '2026-10-16', '08:00', 120, 'medium'],
    ['Team meeting', '2026-10-16', '14:00', null, 'medium'],
    ['Go to the gym', '2026-10-16', '18:00', null, 'medium'],
    ['Call my mentor', '2026-10-17', '19:00', null, 'medium'],
    ['Prepare my presentation', '2026-10-17', '20:00', null, 'medium'],
    ['Submit the report', '2026-10-23', null, null, 'high'],
  ]);
  assert.equal(tasks[2].timeSuggested, true, 'evening is a suggested time');
  assert.equal(tasks[0].timeSuggested, false);
  assert.equal(tasks[4].after, 'Call my mentor');
  assert.equal(tasks[4].timeSuggested, true);
  assert.ok(tasks.every((t) => !t.needsNewTime));
});

test('a single task stays one task', () => {
  const tasks = parseTasks('Call mom tomorrow at 5pm', NOW);
  assert.deepEqual(brief(tasks), [['Call mom', '2026-10-17', '17:00', null, 'medium']]);
});

test('a list on separate lines, with bullets and no times', () => {
  const tasks = parseTasks('- Buy milk\n- Clean the kitchen\n3. Reply to emails', NOW);
  assert.deepEqual(brief(tasks), [
    ['Buy milk', '2026-10-16', null, null, 'medium'],
    ['Clean the kitchen', '2026-10-16', null, null, 'medium'],
    ['Reply to emails', '2026-10-16', null, null, 'medium'],
  ]);
  assert.ok(tasks.every((t) => !t.dateFromText));
});

test('text with no times or days', () => {
  const tasks = parseTasks('I need to water the plants and wash the car', NOW);
  assert.deepEqual(brief(tasks), [
    ['Water the plants', '2026-10-16', null, null, 'medium'],
    ['Wash the car', '2026-10-16', null, null, 'medium'],
  ]);
});

test('does not split inside one activity', () => {
  assert.deepEqual(brief(parseTasks('Buy fish and chips for dinner', NOW)), [['Buy fish and chips for dinner', '2026-10-16', null, null, 'medium']]);
  assert.deepEqual(brief(parseTasks('Buy milk, eggs and bread', NOW)), [['Buy milk, eggs and bread', '2026-10-16', null, null, 'medium']]);
});

test('does not split inside times', () => {
  const tasks = parseTasks('Meet Anna at 2:30 PM. Walk the dog at 8 a.m. tomorrow. Gym at 18:15', NOW);
  assert.deepEqual(brief(tasks), [
    ['Meet Anna', '2026-10-16', '14:30', null, 'medium'],
    ['Walk the dog', '2026-10-17', '08:00', null, 'medium'],
    ['Gym', '2026-10-17', '18:15', null, 'medium'],
  ]);
});

test('time formats: 8am, 8 a.m., 14:00, at 6, noon', () => {
  const times = ['Read at 8am', 'Read at 8 a.m.', 'Read at 14:00', 'Read at 6', 'Read at noon', 'Read at 9 in the evening'].map(
    (text) => parseTasks(text, NOW)[0].startTime,
  );
  assert.deepEqual(times, ['08:00', '08:00', '14:00', '18:00', '12:00', '21:00']);
});

test('parts of the day become suggested times', () => {
  const tasks = parseTasks('Tomorrow morning go for a run, in the afternoon do laundry, tonight read a book', NOW);
  assert.deepEqual(tasks.map((t) => [t.title, t.date, t.startTime, t.timeSuggested]), [
    ['Go for a run', '2026-10-17', '09:00', true],
    ['Do laundry', '2026-10-17', '14:00', true],
    ['Read a book', '2026-10-16', '20:00', true],
  ]);
});

test('day words carry forward until another day word', () => {
  const tasks = parseTasks('On Monday clean the house. Pay rent. Wednesday visit grandma. Cook dinner.', NOW);
  assert.deepEqual(tasks.map((t) => [t.title, t.date]), [
    ['Clean the house', '2026-10-19'],
    ['Pay rent', '2026-10-19'],
    ['Visit grandma', '2026-10-21'],
    ['Cook dinner', '2026-10-21'],
  ]);
});

test('dates: 20/10, 20 Oct, October 25th, next week', () => {
  const dates = ['Dentist on 20/10', 'Dentist on 20 Oct', 'Dentist October 25th', 'Plan the trip next week', 'Pay bills on 5/1'].map(
    (text) => parseTasks(text, NOW)[0].date,
  );
  assert.deepEqual(dates, ['2026-10-20', '2026-10-20', '2026-10-25', '2026-10-19', '2027-01-05']);
});

test('durations: for 2 hours, for two hours, 30 min, 1h 30m, half an hour', () => {
  const durations = ['Study for 2 hours', 'Study for two hours', 'Stretch 30 min', 'Write for 1h 30m', 'Meditate for half an hour', 'Read for an hour and a half'].map(
    (text) => parseTasks(text, NOW)[0].durationMinutes,
  );
  assert.deepEqual(durations, [120, 120, 30, 90, 30, 90]);
});

test('priority words: urgent, important, must', () => {
  const tasks = parseTasks('Pay the electricity bill, it is urgent. Book flights, important. I must call the bank. Water plants', NOW);
  assert.deepEqual(tasks.map((t) => [t.title, t.priority]), [
    ['Pay the electricity bill', 'high'],
    ['Book flights', 'high'],
    ['Call the bank', 'high'],
    ['Water plants', 'medium'],
  ]);
});

test('a time already passed today needs a new time', () => {
  const late = new Date(2026, 9, 16, 15, 0);
  const tasks = parseTasks('Gym at 8 AM and call John at 6 PM', late);
  assert.deepEqual(tasks.map((t) => [t.title, t.needsNewTime]), [['Gym', true], ['Call John', false]]);
});

test('"then" and "also" split; "after that" follows the previous task', () => {
  const tasks = parseTasks('Study at 9 for 90 minutes then have lunch, also call dad. Wash dishes at 4pm and after that rest', NOW);
  assert.deepEqual(tasks.map((t) => [t.title, t.startTime]), [
    ['Study', '09:00'],
    ['Have lunch', null],
    ['Call dad', null],
    ['Wash dishes', '16:00'],
    ['Rest', '17:00'],
  ]);
});

test('long titles are cut to the title limit; filler is removed', () => {
  const long = `I will ${'write a very long report about the project '.repeat(5)}`;
  const [task] = parseTasks(long, NOW);
  assert.ok(task.title.length <= PARSED_TITLE_MAX);
  assert.ok(task.title.startsWith('Write a very long report'));
});

test('empty and filler-only text gives no tasks', () => {
  assert.deepEqual(parseTasks('', NOW), []);
  assert.deepEqual(parseTasks('   \n  ', NOW), []);
  assert.deepEqual(parseTasks('Tomorrow, it is urgent.', NOW), []);
});
