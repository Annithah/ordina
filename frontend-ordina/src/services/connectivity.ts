import * as Network from 'expo-network';

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
  const err = error as { response?: unknown; code?: string; message?: string };
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) return 'slow';
  // No answer at all: the AI server could not be reached.
  if (err?.code === 'LAPTOP_UNREACHABLE' || !err?.response) return 'unreachable';
  return 'problem';
}
