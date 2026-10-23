// Unit tests for ORDINA AI on the phone (planner, Gemini errors, local limit, files). Run with: npm test
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { strToU8, zipSync } from 'fflate';

import { applyScheduleGuards, finishFiles, quickAnswer } from './assistant.ts';
import { AiError, TransportError, generate, generateJson, modelsToTry, resetModelHealth } from './gemini.ts';
import { MAX_INLINE_BYTES, prepareFiles } from './media.ts';
import { validatePlan } from './plan-schema.ts';
import { createPlan, resolveNow } from './planner.ts';
import { computeProfile, correctionsFrom } from './planning-profile.ts';
import { takeRequest } from './rate-limit.ts';

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const ok = (payload) => ({ status: 200, text: JSON.stringify(payload) });
const answer = (text, extra = {}) => ok({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...extra }] });
const noSleep = async () => undefined;

function scripted(...responses) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}

test('validatePlan keeps good tasks and turns a past date into a question', () => {
  const plan = validatePlan({
    summary: 'Two things.',
    tasks: [
      { title: 'Study Python', type: 'study', date: '2026-10-24', startTime: '18:00', durationMinutes: 120, priority: 'high', sources: { date: 'user', startTime: 'user', durationMinutes: 'user', priority: 'ai' } },
      { title: 'Call mum', type: 'call', date: '2026-10-01', priority: 'medium', sources: {} },
    ],
    questions: [],
    assumptions: [],
  }, { today: '2026-10-23' });
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].durationMinutes, 120);
  assert.equal(plan.questions[0].about, 'Call mum');
});

test('createPlan uses the phone clock, avoids busy tasks and keeps the key out of the prompt', async () => {
  let prompt = '';
  const plan = await createPlan({
    message: 'Go to the gym and study for an hour today',
    timezone: 'Africa/Kigali',
    clientToday: '2026-10-23',
    clientTime: '09:00',
    existingTasks: [{ title: 'Team meeting', dueDate: '2026-10-23', startTime: '10:00', duration: '1h 0m' }],
  }, {
    newId: () => 'plan-1',
    generate: async (contents) => {
      prompt = contents[0].parts[0].text;
      return {
        summary: 'Gym and study today.',
        tasks: [
          { title: 'Gym', type: 'exercise', date: '2026-10-23', startTime: '10:00', durationMinutes: 60, priority: 'medium', sources: { date: 'user', startTime: 'ai', durationMinutes: 'ai', priority: 'ai' } },
          { title: 'Study', type: 'study', date: '2026-10-23', startTime: null, durationMinutes: 60, priority: 'medium', sources: { date: 'user', startTime: 'ai', durationMinutes: 'user', priority: 'ai' } },
        ],
        questions: [],
        assumptions: [],
      };
    },
  });
  assert.match(prompt, /"today":"2026-10-23"/);
  assert.match(prompt, /"localTime":"09:00"/);
  assert.doesNotMatch(prompt, /Team meeting/, 'busy blocks are sent as times only');
  assert.equal(plan.planId, 'plan-1');
  const gym = plan.tasks.find((task) => task.title === 'Gym');
  assert.notEqual(gym.startTime, '10:00', 'moved off the meeting');
  assert.ok(gym.adjustedNote);
  const [a, b] = plan.tasks.map((task) => [Number(task.startTime.slice(0, 2)) * 60 + Number(task.startTime.slice(3)), task.durationMinutes]);
  assert.ok(a[0] + a[1] <= b[0] || b[0] + b[1] <= a[0], 'tasks do not overlap each other');
  assert.ok(plan.tasks.every((task) => task.original));
});

test('resolveNow trusts the phone date and time', () => {
  const clock = resolveNow({ timezone: 'Africa/Kigali', clientToday: '2026-10-23', clientTime: '21:15', now: new Date('2026-10-23T19:15:00Z') });
  assert.deepEqual([clock.today, clock.minutes, clock.weekday], ['2026-10-23', 21 * 60 + 15, 'Friday']);
});

test('habits come from the phone history and corrections', () => {
  const history = Array.from({ length: 4 }, () => ({ title: 'Morning run', startTime: '06:00', duration: '0h 45m', priority: 'medium' }));
  const profile = computeProfile(history, correctionsFrom([{ title: 'Run', startTime: '06:30', original: { startTime: '18:00', sources: { startTime: 'ai' } } }]));
  assert.equal(profile.habits.exercise.durationMinutes, 45);
  assert.ok(['06:00', '06:30'].includes(profile.habits.exercise.start));
});

test('Gemini: the key goes in a header, never in the URL', async () => {
  const { transport, calls } = scripted(answer('{"ok":true}'));
  await generateJson({ key: 'test-key-123', model: 'gemini-x', contents: [], transport, sleep: noSleep });
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-key-123');
  assert.doesNotMatch(calls[0].url, /test-key-123/);
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
});

test('Gemini: an invalid key is KEY_REJECTED and the message never contains the key', async () => {
  const { transport } = scripted({ status: 400, text: '{"error":{"message":"API key not valid. Please pass a valid API key."}}' });
  await assert.rejects(generate({ key: 'secret-key', contents: [], transport, sleep: noSleep }), (error) => {
    assert.equal(error.code, 'KEY_REJECTED');
    assert.doesNotMatch(error.message, /secret-key|API key not valid/);
    return true;
  });
});

test('Gemini: quota on every model is QUOTA', async () => {
  const quota = { status: 429, text: '{"error":{"status":"RESOURCE_EXHAUSTED"}}' };
  const { transport } = scripted(quota, quota, quota, quota, quota);
  await assert.rejects(generate({ key: 'k', contents: [], transport, sleep: noSleep }), { code: 'QUOTA' });
});

test('Gemini: a retired model falls back to the next one', async () => {
  const { transport, calls } = scripted({ status: 404, text: '' }, answer('hi'));
  const result = await generate({ key: 'k', model: 'old-model', contents: [], transport, sleep: noSleep });
  assert.equal(result.text, 'hi');
  assert.equal(calls.length, 2);
});

test('Gemini: a busy model is skipped next time, the one that answered goes first', async () => {
  resetModelHealth();
  const { transport, calls } = scripted({ status: 503, text: '' }, answer('ok'));
  await generate({ key: 'k', model: 'gemini-3.8-flash', contents: [], transport, sleep: noSleep });
  assert.match(calls[1].url, /gemini-3\.5-flash-lite/);
  const order = modelsToTry('gemini-3.8-flash');
  assert.equal(order[0], 'gemini-3.5-flash-lite');
  assert.equal(order.at(-1), 'gemini-3.8-flash');
  resetModelHealth();
});

test('Gemini: one automatic retry on a network error, then NETWORK', async () => {
  const retried = scripted(new TransportError('network'), answer('ok'));
  assert.equal((await generate({ key: 'k', contents: [], transport: retried.transport, sleep: noSleep })).text, 'ok');
  const failing = scripted(new TransportError('network'), new TransportError('network'));
  await assert.rejects(generate({ key: 'k', contents: [], transport: failing.transport, sleep: noSleep }), { code: 'NETWORK' });
  assert.equal(failing.calls.length, 2);
});

test('Gemini: timeouts and safety blocks', async () => {
  const slow = scripted(new TransportError('timeout'));
  await assert.rejects(generate({ key: 'k', contents: [], transport: slow.transport, sleep: noSleep }), { code: 'TIMEOUT' });
  assert.equal(slow.calls[0].timeoutMs, 30_000);
  const blocked = scripted(ok({ promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(generateJson({ key: 'k', contents: [], transport: blocked.transport, sleep: noSleep }), { code: 'SAFETY' });
  await assert.rejects(generate({ key: '', contents: [], transport: slow.transport }), { code: 'NOT_CONFIGURED' });
});

test('local limit: 10 a minute and 100 a day', () => {
  const now = new Date(2026, 9, 23, 9, 0, 0);
  let state = null;
  for (let i = 0; i < 10; i += 1) state = takeRequest(state, now).next;
  assert.equal(takeRequest(state, now).reason, 'minute');
  assert.equal(takeRequest(state, new Date(now.getTime() + 61_000)).allowed, true);
  assert.equal(takeRequest({ recent: [], day: '2026-10-23', dayCount: 100 }, now).reason, 'day');
  assert.equal(takeRequest({ recent: [], day: '2026-10-22', dayCount: 100 }, now).allowed, true, 'a new day starts fresh');
});

test('files: photos go inline, Word and text become text, limits are checked', () => {
  const jpeg = toBase64([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(1)]);
  const docx = toBase64(zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>Exam on Friday &amp; essay</w:t></w:r></w:p></w:body></w:document>') }));
  const csv = toBase64(strToU8('task,date\nPay rent,2026-10-30\n'));
  const { parts, kinds } = prepareFiles([{ data: jpeg, name: 'list.jpg' }, { data: docx, name: 'plan.docx' }, { data: csv, name: 'todo.csv' }]);
  assert.deepEqual(kinds, ['image', 'docx', 'text']);
  assert.equal(parts[0].inlineData.mimeType, 'image/jpeg');
  assert.match(parts[1].text, /Exam on Friday & essay/);
  assert.match(parts[2].text, /Pay rent/);

  const many = Array.from({ length: 6 }, () => ({ data: jpeg, name: 'a.jpg' }));
  assert.throws(() => prepareFiles(many), (error) => error instanceof AiError && error.code === 'FILE_TOO_MANY');
  const otherZip = toBase64(zipSync({ 'readme.txt': strToU8('hi') }));
  assert.throws(() => prepareFiles([{ data: otherZip, name: 'x.zip' }]), { code: 'FILE_UNSUPPORTED' });
  const exe = toBase64([0x4d, 0x5a, 0x00, 0x01, 0x02, ...new Array(60).fill(0)]);
  assert.throws(() => prepareFiles([{ data: exe, name: 'virus.pdf' }]), { code: 'FILE_UNSUPPORTED' });
  const big = Buffer.alloc(9 * 1024 * 1024, 1);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const nine = big.toString('base64');
  assert.ok(9 * 1024 * 1024 * 3 > MAX_INLINE_BYTES);
  assert.throws(() => prepareFiles([{ data: nine, name: 'a.jpg' }, { data: nine, name: 'b.jpg' }, { data: nine, name: 'c.jpg' }]), { code: 'FILES_TOO_LARGE' });
});

test('assistant: proposed tasks move off clashes; empty file answers become a short answer', () => {
  const existing = [{ title: 'Lecture', dueDate: '2026-10-24', startTime: '09:00', duration: '2h 0m' }];
  const result = applyScheduleGuards({ intent: 'create_tasks', message: 'ok', tasks: [{ title: 'Revise', date: '2026-10-24', startTime: '10:00', durationMinutes: 60 }] }, existing);
  assert.equal(result.intent, 'conflict');
  assert.equal(result.tasks[0].startTime, '08:00', 'first free hour before the lecture');
  assert.equal(finishFiles({ intent: 'create_tasks', tasks: [] }, ['image'], []).intent, 'answer');
  assert.equal(quickAnswer('What should I do now?', [{ title: 'Pay rent', priority: 'high', dueDate: '2026-10-23' }]).recommendation.title, 'Pay rent');
});
