import * as Network from 'expo-network';

import { isAiError } from '@/features/ai/gemini';

/** False only when the phone is sure there is no internet; if unsure, let the request try. */
export async function isOnline() {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/** What went wrong with an ORDINA AI request, so the screen can explain it calmly. */
export type AiNoticeKind = 'offline' | 'unreachable' | 'slow' | 'problem';

export function aiNoticeKind(error: unknown): AiNoticeKind {
  if (isAiError(error)) {
    if (error.code === 'OFFLINE') return 'offline';
    if (error.code === 'TIMEOUT') return 'slow';
    if (error.code === 'NETWORK' || error.code === 'BUSY') return 'unreachable';
    return 'problem';
  }
  const err = error as { response?: unknown; code?: string; message?: string };
  if (err?.code === 'INVALID') return 'problem';
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) return 'slow';
  // No answer at all: the AI server could not be reached.
  if (err?.code === 'LAPTOP_UNREACHABLE' || !err?.response) return 'unreachable';
  return 'problem';
}
