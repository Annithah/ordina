/**
 * ORDINA AI runs on the server. A signed-in user's requests use their account token (already on
 * the api client). Without an account, the phone identifies itself with a random device id
 * (kept in secure storage) and gets a token used only for AI requests, so learned planning
 * habits stay per phone. Tasks never leave the phone except as AI context.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { translate } from '@/i18n';
import { API_BASE_URL, COLD_START_MS, api } from '@/services/api';

const DEVICE_ID_KEY = 'ordina.deviceId';

export class ServerUnreachableError extends Error {
  code = 'SERVER_UNREACHABLE';
  constructor() {
    super(translate('ai.serverUnreachable'));
  }
}

/** Kept for older imports. */
export const LaptopUnreachableError = ServerUnreachableError;

let token: string | null = null;

async function deviceId() {
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (stored) return stored;
    const created = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return Crypto.randomUUID();
  }
}

/** No response at all (server down, no route, timeout): the server is unreachable. */
export function isUnreachable(error: unknown) {
  const err = error as { response?: unknown; code?: string };
  return !err?.response || err?.code === 'ECONNABORTED';
}

/** Reachability check. The free server can take about a minute to wake up, so allow that. */
export async function ensureServer() {
  if (!API_BASE_URL) throw new ServerUnreachableError();
  try {
    await api.get('/health', { timeout: 8000 + COLD_START_MS });
  } catch {
    throw new ServerUnreachableError();
  }
}

const signedIn = () => Boolean(api.defaults.headers.common.Authorization);

async function deviceToken(refresh = false) {
  if (token && !refresh) return token;
  const { data } = await api.post('/api/device/session', { deviceId: await deviceId() }, { timeout: 15_000 + COLD_START_MS });
  token = String(data.token);
  return token;
}

/**
 * Runs an AI request with the right token. An unreachable server becomes a
 * ServerUnreachableError; an expired device token is renewed once.
 */
export async function withAiSession<T>(request: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  await ensureServer();
  try {
    if (signedIn()) return await request({});
    try {
      return await request({ Authorization: `Bearer ${await deviceToken()}` });
    } catch (error: any) {
      if (error?.response?.status !== 401) throw error;
      return await request({ Authorization: `Bearer ${await deviceToken(true)}` });
    }
  } catch (error) {
    if (isUnreachable(error)) throw new ServerUnreachableError();
    throw error;
  }
}

/** Kept for older imports. */
export const withLaptop = withAiSession;
