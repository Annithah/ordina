// Real ORDINA AI planning request with the app's own code (phone -> Gemini, no backend).
// Reads EXPO_PUBLIC_GEMINI_API_KEY from .env; never prints it. Run: node scripts/ai-smoke-test.mjs
import { readFileSync } from 'node:fs';

import { fetchTransport, generateJson } from '../src/features/ai/gemini.ts';
import { createPlan } from '../src/features/ai/planner.ts';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((line) => /^\w+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '').trim()]));
const key = env.EXPO_PUBLIC_GEMINI_API_KEY;
if (!key) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is missing in .env');

// Logs each attempt: model, HTTP status, time (never the key).
const logged = (inner) => async (request) => {
  const t = Date.now();
  const model = request.url.split("/models/")[1].split(":")[0];
  try {
    const response = await inner(request);
    console.log(`  ${model}: HTTP ${response.status} in ${Date.now() - t} ms`);
    return response;
  } catch (error) {
    console.log(`  ${model}: ${error.kind} after ${Date.now() - t} ms`);
    throw error;
  }
};

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const started = Date.now();
try {
  const plan = await createPlan({
    message: 'Go to the gym tomorrow at 7am, study Python for 2 hours, and call my mentor in the evening',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    clientToday: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    clientTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    existingTasks: [],
  }, {
    newId: () => crypto.randomUUID(),
    generate: (contents, options) => generateJson({ key, model: env.EXPO_PUBLIC_GEMINI_MODEL, contents, transport: logged(fetchTransport()), ...options }),
  });
  console.log(`OK in ${Date.now() - started} ms: ${plan.summary}`);
  for (const task of plan.tasks) console.log(`- ${task.date} ${task.startTime} ${task.durationMinutes}m [${task.priority}] ${task.title}`);
  if (plan.questions.length) console.log('Questions:', plan.questions.map((q) => q.question).join(' | '));
} catch (error) {
  console.log('FAILED:', error.code || error.name);
  process.exit(1);
}
