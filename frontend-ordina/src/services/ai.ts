import { LOCAL_MODE } from '@/config/release';
import { api, COLD_START_MS } from '@/services/api';
import { withLaptop } from '@/services/device-session';
import { knownCategory } from '@/features/categories';
import { confirmLocalPlan, createLocalTask } from '@/services/local-tasks';
import { useCategoriesStore } from '@/store/categories-store';
import { useTasksStore } from '@/store/tasks-store';
import type { CalendarBusyEvent } from '@/services/google-calendar';
import type { Plan } from '@/types/plan';
import { addLocalDays, localDateKey } from '@/utils/dates';

export type IntegrationId = 'contacts' | 'calendar' | 'microphone' | 'notifications' | 'location' | 'camera';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** The open chat's last messages (see features/chat-groups contextWindow). */
export type ChatContext = { role: 'user' | 'assistant'; content: string }[];

export async function interpretInstruction(payload: {
  message: string;
  conversation?: ChatContext;
  timezone?: string;
  contacts?: { name: string; phone?: string }[];
  calendarEvents?: CalendarBusyEvent[];
}) {
  const { data } = await api.post('/api/ai/interpret', payload, { timeout: 90000 });
  return data;
}

/** Plain language -> plan for review (nothing is saved). The server allows Gemini ~45s. */
export async function requestPlan(payload: {
  message: string;
  answers?: { question: string; answer: string }[];
  keepTasks?: unknown[];
  conversation?: ChatContext;
}) {
  const now = new Date();
  const body = {
    ...payload,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today: localDateKey(now),
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
  if (!LOCAL_MODE) {
    const { data } = await api.post('/api/ai/plan', body, { timeout: 60_000 + COLD_START_MS });
    return data as Plan;
  }
  // Offline mode: the laptop has no copy of the tasks, so send what planning needs.
  const context = localPlanningContext(localDateKey(now));
  return withLaptop(async (headers) => (await api.post('/api/ai/plan', { ...body, ...context }, { timeout: 60_000, headers })).data as Plan);
}

/** Busy times for the coming week (overlap checks) and recent tasks (learned habits). */
function localPlanningContext(today: string) {
  const tasks = useTasksStore.getState().tasks;
  const weekEnd = addLocalDays(today, 8);
  const existingTasks = tasks
    .filter((task) => !task.completed && task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd && task.startTime)
    .map((task) => ({ title: task.title, dueDate: task.dueDate, startTime: task.startTime, duration: task.duration, completed: task.completed }));
  const history = [...tasks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 150)
    .map((task) => ({ title: task.title, description: task.description, startTime: task.startTime, duration: task.duration, priority: task.priority }));
  return { existingTasks, history };
}

/**
 * Saves the reviewed plan. The plan id doubles as the idempotency key, so a retry
 * or double tap returns the same tasks instead of creating duplicates.
 */
export async function confirmPlan(planId: string, tasks: unknown[]) {
  if (LOCAL_MODE) {
    // Saved on the phone (exactly once per plan id). Learning from the user's edits is
    // best-effort: the tasks are already saved even if the laptop is unreachable.
    const result = await confirmLocalPlan(planId, tasks as Record<string, unknown>[]);
    if (!result.replayed) {
      const { history } = localPlanningContext(localDateKey());
      void withLaptop((headers) => api.post('/api/ai/plan/learn', { tasks, history }, { timeout: 15_000, headers })).catch(() => undefined);
    }
    return result;
  }
  const send = () => api.post('/api/ai/plan/confirm', { idempotencyKey: planId, tasks }, { timeout: 30_000 + COLD_START_MS });
  try {
    const { data } = await send();
    return data as { created: { id: string; title: string }[]; replayed?: boolean };
  } catch (error: any) {
    // Another request with this key is still saving: wait briefly and ask again.
    if (error?.response?.status !== 409) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const { data } = await send();
    return data as { created: { id: string; title: string }[]; replayed?: boolean };
  }
}

export async function confirmAiActions(payload: { tasks?: unknown[]; reschedule?: unknown; arrivalReminders?: unknown[] }) {
  if (LOCAL_MODE) return saveProposedTasksOnPhone(payload.tasks ?? []);
  const { data } = await api.post('/api/ai/confirm', payload, { timeout: 30000 });
  return data;
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
  contactPhone?: string;
};

/** Offline mode: tasks ORDINA found (e.g. in a photo) are saved in the phone's database. */
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

export type UploadFile = { data: string; mimeType: string; name: string };

/**
 * Photos and files -> tasks (or an answer), through the ORDINA server only (never straight to
 * Gemini). `onProgress` gets 0..1 while the files upload.
 */
export async function interpretFromFiles(payload: {
  files: UploadFile[];
  note?: string;
  timezone?: string;
  calendarEvents?: CalendarBusyEvent[];
  conversation?: ChatContext;
}, onProgress?: (fraction: number) => void) {
  const body = {
    ...payload,
    // Offline mode: the laptop has no copy of the tasks, so send the busy times for overlap checks.
    ...(LOCAL_MODE ? { existingTasks: localPlanningContext(localDateKey()).existingTasks } : {}),
  };
  const config = {
    timeout: 180_000,
    onUploadProgress: (event: { loaded: number; total?: number }) => {
      if (event.total) onProgress?.(Math.min(1, event.loaded / event.total));
    },
  };
  if (LOCAL_MODE) {
    return withLaptop(async (headers) => (await api.post('/api/ai/from-media', body, { ...config, headers })).data);
  }
  const { data } = await api.post('/api/ai/from-media', body, config);
  return data;
}

export async function transcribeAudio(audio: string, mimeType?: string) {
  if (LOCAL_MODE) {
    return withLaptop(async (headers) => (await api.post('/api/ai/transcribe', { audio, mimeType }, { timeout: 90000, headers })).data.text as string);
  }
  const { data } = await api.post('/api/ai/transcribe', { audio, mimeType }, { timeout: 90000 });
  return data.text as string;
}

export async function deleteAccount() {
  await api.delete('/api/auth/account');
}

export async function requestPasswordReset(email: string) {
  const { data } = await api.post('/api/auth/forgot', { email });
  return data as { emailed: boolean; code?: string; message: string };
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const { data } = await api.post('/api/auth/reset', { email, code, newPassword });
  return data;
}
