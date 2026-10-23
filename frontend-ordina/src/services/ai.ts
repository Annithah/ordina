import { AI_MODE } from '@/config/release';
import { api } from '@/services/api';
import { directProvider } from '@/services/ai/direct';
import { serverProvider } from '@/services/ai/server';
import type { AiProvider } from '@/services/ai/types';

export type { ChatContext, UploadFile } from '@/services/ai/types';

export type IntegrationId = 'contacts' | 'calendar' | 'microphone' | 'notifications' | 'location' | 'camera';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * Every ORDINA AI request goes through this one switch (EXPO_PUBLIC_AI_MODE):
 * "direct" (default) phone -> Gemini; "server" phone -> ORDINA backend -> Gemini.
 */
const provider: AiProvider = AI_MODE === 'server' ? serverProvider : directProvider;

export const requestPlan: AiProvider['requestPlan'] = (payload) => provider.requestPlan(payload);
export const confirmPlan: AiProvider['confirmPlan'] = (planId, tasks) => provider.confirmPlan(planId, tasks);
export const interpretInstruction: AiProvider['interpretInstruction'] = (payload) => provider.interpretInstruction(payload);
export const confirmAiActions: AiProvider['confirmAiActions'] = (payload) => provider.confirmAiActions(payload);
export const interpretFromFiles: AiProvider['interpretFromFiles'] = (payload, onProgress) => provider.interpretFromFiles(payload, onProgress);
export const transcribeAudio: AiProvider['transcribeAudio'] = (audio, mimeType) => provider.transcribeAudio(audio, mimeType);

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
