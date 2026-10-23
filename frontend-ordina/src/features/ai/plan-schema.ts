/**
 * The AI plan contract: the JSON schema Gemini must follow, and a validator that checks (and
 * where safe, repairs) whatever comes back before the app sees it.
 * Ported from backend-ordina/src/lib/plan-schema.js; keep the two in step.
 */
import { TASK_TYPES, classifyTaskType, type Priority } from './planning-profile.ts';

export const MAX_TASKS = 20;
const MAX_QUESTIONS = 5;
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const WINDOWS = ['morning', 'afternoon', 'evening', 'night'] as const;
const SOURCE_FIELDS = ['date', 'startTime', 'durationMinutes', 'priority'] as const;

export type TimeWindow = (typeof WINDOWS)[number];
export type SourceField = (typeof SOURCE_FIELDS)[number];
export type Source = 'user' | 'ai' | 'habit';

export type ValidTask = {
  title: string;
  description: string | null;
  type: string;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  priority: Priority;
  deadline: string | null;
  timeWindow: TimeWindow | null;
  sources: Record<SourceField, Source>;
  note: string | null;
};

export type PlanQuestion = { id: string; question: string; about: string | null; options: string[] };

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

const sourceSchema = { type: 'STRING', enum: ['user', 'ai'] };

/** Gemini responseSchema (OpenAPI subset). */
export const PLAN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'One or two friendly sentences describing the plan.' },
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Short action title, e.g. "Study Python".' },
          description: { type: 'STRING', nullable: true },
          type: { type: 'STRING', enum: TASK_TYPES },
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          startTime: { type: 'STRING', nullable: true, description: '24-hour HH:MM' },
          durationMinutes: { type: 'INTEGER', nullable: true },
          priority: { type: 'STRING', enum: PRIORITIES },
          deadlineDate: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD, only if the user gave a deadline' },
          deadlineTime: { type: 'STRING', nullable: true, description: 'HH:MM, only if the user gave a deadline time' },
          timeWindow: { type: 'STRING', nullable: true, description: 'morning | afternoon | evening | night when the user named a part of the day' },
          sources: {
            type: 'OBJECT',
            properties: {
              date: sourceSchema,
              startTime: sourceSchema,
              durationMinutes: sourceSchema,
              priority: sourceSchema,
            },
            required: SOURCE_FIELDS,
          },
          note: { type: 'STRING', nullable: true, description: 'Short reason for a suggested value, if helpful.' },
        },
        required: ['title', 'type', 'date', 'priority', 'sources'],
      },
    },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          about: { type: 'STRING', nullable: true, description: 'The activity the question is about.' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['question'],
      },
    },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'tasks', 'questions', 'assumptions'],
};

function cleanString(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Thrown when Gemini's answer is not a plan at all. */
export class InvalidPlanError extends Error {
  code = 'INVALID' as const;
  constructor() {
    super('ORDINA AI returned an answer we could not read.');
  }
}

/**
 * Validates the raw Gemini object. Tasks with an unusable date are not guessed: they become a
 * clarification question instead.
 */
export function validatePlan(raw: any, { today }: { today: string }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidPlanError();
  let repaired = false;
  const questions: Omit<PlanQuestion, 'id'>[] = [];
  const tasks: ValidTask[] = [];

  const rawTasks: any[] = Array.isArray(raw.tasks) ? raw.tasks : [];
  if (!Array.isArray(raw.tasks) && raw.tasks !== undefined) repaired = true;
  if (rawTasks.length > MAX_TASKS) repaired = true;

  for (const item of rawTasks.slice(0, MAX_TASKS)) {
    if (!item || typeof item !== 'object') {
      repaired = true;
      continue;
    }
    const title = cleanString(item.title, 200);
    if (!title) {
      repaired = true;
      continue;
    }
    if (!isValidDateKey(item.date) || item.date < today) {
      repaired = true;
      questions.push({ question: `When would you like to do “${title}”?`, about: title, options: ['Today', 'Tomorrow', 'You decide'] });
      continue;
    }
    const description = cleanString(item.description, 2000) || null;
    const rawSources = item.sources && typeof item.sources === 'object' ? item.sources : {};
    const sources = {} as Record<SourceField, Source>;
    for (const field of SOURCE_FIELDS) sources[field] = rawSources[field] === 'user' ? 'user' : 'ai';

    const startTime = isValidTime(item.startTime) ? item.startTime : null;
    if (item.startTime && !startTime) repaired = true;
    if (!startTime) sources.startTime = 'ai';

    let durationMinutes: number | null = Number.isInteger(item.durationMinutes) ? item.durationMinutes : Math.round(Number(item.durationMinutes));
    if (!Number.isFinite(durationMinutes) || durationMinutes! < 5 || durationMinutes! > 24 * 60) {
      if (item.durationMinutes != null) repaired = true;
      durationMinutes = null;
      sources.durationMinutes = 'ai';
    }

    let priority: Priority | null = PRIORITIES.includes(item.priority) ? item.priority : null;
    if (!priority) {
      repaired = true;
      priority = 'medium';
      sources.priority = 'ai';
    }

    let deadlineDate = isValidDateKey(item.deadlineDate) ? item.deadlineDate : null;
    const deadlineTime = isValidTime(item.deadlineTime) ? item.deadlineTime : null;
    if (!deadlineDate && deadlineTime) deadlineDate = item.date;
    const deadline = deadlineDate ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : deadlineDate) : null;

    const timeWindow = WINDOWS.includes(item.timeWindow) ? item.timeWindow as TimeWindow : null;
    const type = classifyTaskType(title, description, TASK_TYPES.includes(item.type) ? item.type : undefined);

    tasks.push({
      title,
      description,
      type,
      date: item.date,
      startTime,
      durationMinutes,
      priority,
      deadline,
      timeWindow,
      sources,
      note: cleanString(item.note, 200) || null,
    });
  }

  for (const item of Array.isArray(raw.questions) ? raw.questions : []) {
    const question = cleanString(item?.question ?? item, 300);
    if (!question) continue;
    const options = (Array.isArray(item?.options) ? item.options : [])
      .map((option: unknown) => cleanString(option, 80))
      .filter(Boolean)
      .slice(0, 4);
    questions.push({ question, about: cleanString(item?.about, 200) || null, options });
  }

  const assumptions = (Array.isArray(raw.assumptions) ? raw.assumptions : [])
    .map((item: unknown) => cleanString(item, 200))
    .filter(Boolean)
    .slice(0, 8) as string[];

  const summary = cleanString(raw.summary, 400)
    || (tasks.length ? `Here is a plan with ${tasks.length} task${tasks.length === 1 ? '' : 's'}.` : 'I need a little more detail to plan this.');

  return {
    summary,
    tasks,
    questions: questions.slice(0, MAX_QUESTIONS).map((item, index): PlanQuestion => ({ id: `q${index + 1}`, ...item })),
    assumptions,
    repaired,
  };
}
