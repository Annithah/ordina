import { api, COLD_START_MS } from '@/services/api';
import type { CalendarBusyEvent } from '@/services/google-calendar';
import type { Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';

export type IntegrationId = 'contacts' | 'calendar' | 'microphone' | 'notifications' | 'location' | 'camera';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function interpretInstruction(payload: {
  message: string;
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
}) {
  const now = new Date();
  const { data } = await api.post('/api/ai/plan', {
    ...payload,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today: localDateKey(now),
    localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  }, { timeout: 60_000 + COLD_START_MS });
  return data as Plan;
}

/**
 * Saves the reviewed plan. The plan id doubles as the idempotency key, so a retry
 * or double tap returns the same tasks instead of creating duplicates.
 */
export async function confirmPlan(planId: string, tasks: unknown[]) {
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
  const { data } = await api.post('/api/ai/confirm', payload, { timeout: 30000 });
  return data;
}

export async function interpretFromMedia(payload: {
  media: string;
  mimeType: string;
  note?: string;
  timezone?: string;
  calendarEvents?: CalendarBusyEvent[];
}) {
  const { data } = await api.post('/api/ai/from-media', payload, { timeout: 180000 });
  return data;
}

export async function transcribeAudio(audio: string, mimeType?: string) {
  const { data } = await api.post('/api/ai/transcribe', { audio, mimeType }, { timeout: 90000 });
  return data.text as string;
}

export async function deleteAccount() {
  await api.delete('/api/auth/account');
}

export async function fetchAiMessages() {
  const { data } = await api.get('/api/ai/messages');
  return data.messages ?? [];
}

export async function requestPasswordReset(email: string) {
  const { data } = await api.post('/api/auth/forgot', { email });
  return data as { emailed: boolean; code?: string; message: string };
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const { data } = await api.post('/api/auth/reset', { email, code, newPassword });
  return data;
}
