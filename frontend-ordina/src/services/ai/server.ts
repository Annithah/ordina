/**
 * ORDINA AI through the ORDINA backend (HTTPS, key kept on the server). Not used by default;
 * switch with EXPO_PUBLIC_AI_MODE=server before a public Play Store release.
 */
import { api, COLD_START_MS } from '@/services/api';
import type { AiProvider } from '@/services/ai/types';
import type { Plan } from '@/types/plan';
import { localDateKey } from '@/utils/dates';

export const serverProvider: AiProvider = {
  async requestPlan(payload) {
    const now = new Date();
    const body = {
      ...payload,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      today: localDateKey(now),
      localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
    const { data } = await api.post('/api/ai/plan', body, { timeout: 60_000 + COLD_START_MS });
    return data as Plan;
  },

  /** The plan id doubles as the idempotency key, so a retry or double tap creates no duplicates. */
  async confirmPlan(planId, tasks) {
    const send = () => api.post('/api/ai/plan/confirm', { idempotencyKey: planId, tasks }, { timeout: 30_000 + COLD_START_MS });
    try {
      return (await send()).data;
    } catch (error: any) {
      // Another request with this key is still saving: wait briefly and ask again.
      if (error?.response?.status !== 409) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return (await send()).data;
    }
  },

  async interpretInstruction(payload) {
    return (await api.post('/api/ai/interpret', payload, { timeout: 90_000 })).data;
  },

  async confirmAiActions(payload) {
    return (await api.post('/api/ai/confirm', payload, { timeout: 30_000 })).data;
  },

  async interpretFromFiles(payload, onProgress) {
    const { data } = await api.post('/api/ai/from-media', payload, {
      timeout: 180_000,
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        if (event.total) onProgress?.(Math.min(1, event.loaded / event.total));
      },
    });
    return data;
  },

  async transcribeAudio(audio, mimeType) {
    return (await api.post('/api/ai/transcribe', { audio, mimeType }, { timeout: 90_000 })).data.text as string;
  },
};
