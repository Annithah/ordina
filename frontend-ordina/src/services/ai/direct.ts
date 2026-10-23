/**
 * ORDINA AI straight from the phone (default): Gemini is called over HTTPS with the key stored in
 * SQLite, so no ORDINA server or computer is needed, only internet. Planning, validation, time
 * zones, overlap checks and learning from the user's edits all run here, on the phone's tasks.
 */
import * as Crypto from 'expo-crypto';

import { LOCAL_MODE } from '@/config/release';
import { knownCategory } from '@/features/categories';
import { TRANSCRIBE_PROMPT, filesContents, finishFiles, finishInterpret, interpretPrompt, quickAnswer, type ScheduledTask } from '@/features/ai/assistant';
import { prepareFiles } from '@/features/ai/media';
import { createPlan } from '@/features/ai/planner';
import { HISTORY_LIMIT, computeProfile, correctionsFrom, mergeCorrections, type Correction } from '@/features/ai/planning-profile';
import { geminiJson, geminiText } from '@/services/ai/geminiClient';
import { serverProvider } from '@/services/ai/server';
import type { AiProvider } from '@/services/ai/types';
import type { CalendarBusyEvent } from '@/services/google-calendar';
import { confirmLocalPlan, createLocalTask, getMeta, setMeta } from '@/services/local-tasks';
import { useCategoriesStore } from '@/store/categories-store';
import { useTasksStore, type Task } from '@/store/tasks-store';
import type { Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';

const CORRECTIONS_KEY = 'ai.planningCorrections.v1';
const HISTORY_DAYS = 90;
/** Files can take a while to upload on mobile data, so each attempt may last longer. */
const FILES_ATTEMPT_MS = 90_000;

function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function localTime(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** The user's tasks plus calendar events, as busy times for overlap checks. */
function scheduledTasks(events: CalendarBusyEvent[] = []): ScheduledTask[] {
  const tasks = useTasksStore.getState().tasks.map((task: Task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    startTime: task.startTime,
    duration: task.duration,
    priority: task.priority,
    completed: task.completed,
    status: task.status,
  }));
  const busy = events.map((event) => ({ title: event.title, dueDate: event.date, startTime: event.startTime, duration: `${event.durationMinutes}m`, completed: false }));
  return [...tasks, ...busy];
}

/** Recent tasks on this phone (last 90 days, newest first): what ORDINA learns habits from. */
function recentHistory() {
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return [...useTasksStore.getState().tasks]
    .filter((task) => task.updatedAt >= since || (task.dueDate && task.dueDate >= since.slice(0, 10)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, HISTORY_LIMIT)
    .map((task) => ({ title: task.title, description: task.description, startTime: task.startTime, duration: task.duration, priority: task.priority }));
}

async function planningProfile() {
  const corrections = await getMeta<Correction[]>(CORRECTIONS_KEY, []).catch(() => []);
  return computeProfile(recentHistory(), corrections);
}

/** Remembers which ORDINA suggestions the user changed, so the next plans follow their habits. */
async function learnFromPlan(tasks: Record<string, unknown>[]) {
  const corrections = correctionsFrom(tasks.slice(0, 20).map((task) => ({
    title: String(task.title ?? '').slice(0, 200),
    description: typeof task.description === 'string' ? task.description.slice(0, 300) : null,
    type: typeof task.type === 'string' ? task.type : undefined,
    startTime: typeof task.startTime === 'string' ? task.startTime : null,
    durationMinutes: Number.isFinite(Number(task.durationMinutes)) ? Number(task.durationMinutes) : null,
    priority: typeof task.priority === 'string' ? task.priority : null,
    original: task.original as never,
  })));
  if (!corrections.length) return;
  await setMeta(CORRECTIONS_KEY, mergeCorrections(await getMeta<Correction[]>(CORRECTIONS_KEY, []), corrections));
}

type Proposed = {
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  priority?: string;
  category?: string;
  reminder?: boolean;
  contactName?: string;
};

/** Tasks ORDINA found (e.g. in a photo) are saved in the phone's database. */
async function saveProposedTasksOnPhone(tasks: unknown[]) {
  const created = [];
  for (const raw of tasks as Proposed[]) {
    if (!raw?.title) continue;
    const task = await createLocalTask({
      title: raw.title,
      description: raw.description ?? '',
      dueDate: raw.date || localDateKey(),
      startTime: raw.startTime || undefined,
      duration: raw.durationMinutes || undefined,
      priority: raw.priority === 'high' || raw.priority === 'low' ? raw.priority : 'medium',
      // A category the phone knows, else the one its words point to (never an unknown id).
      category: knownCategory(raw.category) ?? useCategoriesStore.getState().suggest(`${raw.title} ${raw.description ?? ''}`) ?? undefined,
      completed: false,
    });
    created.push({ ...task, reminder: Boolean(raw.reminder), contactName: raw.contactName });
  }
  await useTasksStore.getState().loadTasks();
  return { created };
}

export const directProvider: AiProvider = {
  async requestPlan({ message, answers, keepTasks, conversation }) {
    const now = new Date();
    const plan = await createPlan({
      message: message.slice(0, 2000),
      answers: (answers ?? []).slice(0, 5),
      keepTasks,
      timezone: timezone(),
      clientToday: localDateKey(now),
      clientTime: localTime(now),
      existingTasks: scheduledTasks(),
      profile: await planningProfile(),
      conversation,
    }, {
      generate: (contents, options) => geminiJson(contents, options),
      newId: () => Crypto.randomUUID(),
    });
    return plan as Plan;
  },

  async confirmPlan(planId, tasks) {
    if (!LOCAL_MODE) return serverProvider.confirmPlan(planId, tasks);
    // Saved on the phone, exactly once per plan id. Learning is best-effort: the tasks are saved.
    const result = await confirmLocalPlan(planId, tasks as Record<string, unknown>[]);
    if (!result.replayed) await learnFromPlan(tasks as Record<string, unknown>[]).catch(() => undefined);
    return result;
  },

  async interpretInstruction({ message, conversation, contacts, calendarEvents }) {
    const existing = scheduledTasks(calendarEvents);
    const quick = quickAnswer(message, existing);
    if (quick) return quick;
    const parsed = await geminiJson([{
      role: 'user',
      parts: [{ text: interpretPrompt({ message, today: localDateKey(), timezone: timezone(), conversation, existingTasks: existing, contacts }) }],
    }]);
    return finishInterpret(parsed, existing, contacts);
  },

  async confirmAiActions(payload) {
    if (!LOCAL_MODE) return serverProvider.confirmAiActions(payload);
    return saveProposedTasksOnPhone(payload.tasks ?? []);
  },

  async interpretFromFiles({ files, note, conversation, calendarEvents }, onProgress) {
    const { parts, kinds } = prepareFiles(files.map((file) => ({ data: file.data, name: file.name })));
    const existing = scheduledTasks(calendarEvents);
    const parsed = await geminiJson(
      filesContents({ parts, kinds, names: files.map((file) => file.name), note, today: localDateKey(), timezone: timezone(), existingTasks: existing, conversation }),
      { deadlineMs: 2 * FILES_ATTEMPT_MS, attemptTimeoutMs: FILES_ATTEMPT_MS, onUploadProgress: onProgress },
    );
    return finishFiles(parsed, kinds, existing);
  },

  async transcribeAudio(audio, mimeType) {
    const text = await geminiText([{
      role: 'user',
      parts: [{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType: mimeType || 'audio/mp4', data: audio } }],
    }]);
    return String(text || '').trim();
  },
};
