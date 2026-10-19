/**
 * The signed-in session: a short-lived access token and a refresh token, kept in the phone's
 * secure storage (expo-secure-store). When the server answers 401, the access token is renewed
 * once with the refresh token and the request is retried; if that fails the user is signed out
 * on this phone (tasks stay).
 */
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { api, setAuthToken } from '@/services/api';

const SESSION_KEY = 'ordina.session.v2';

export type SessionUser = { id: number; name: string; email: string };
export type Session = { user: SessionUser; accessToken: string; refreshToken: string };

async function read(key: string) {
  try {
    if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Secure storage unavailable: the session lasts until the app closes.
  }
}

let current: Session | null = null;
let onExpired: (() => void) | null = null;

export function isSession(value: unknown): value is Session {
  const s = value as Session;
  return Boolean(s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' && s.user && typeof s.user.email === 'string');
}

export async function loadSession(): Promise<Session | null> {
  const raw = await read(SESSION_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    current = isSession(parsed) ? parsed : null;
  } catch {
    current = null;
  }
  setAuthToken(current?.accessToken);
  return current;
}

export async function saveSession(session: Session | null) {
  current = session;
  setAuthToken(session?.accessToken);
  await write(SESSION_KEY, session ? JSON.stringify(session) : null);
}

export const getSession = () => current;

/** Called when the session cannot be renewed (signed out on this phone). */
export function setSessionExpiredHandler(handler: () => void) {
  onExpired = handler;
}

let refreshing: Promise<string | null> | null = null;

/** Gets a new access token (one request at a time). null when the session is no longer valid. */
export function refreshAccessToken(): Promise<string | null> {
  if (!current) return Promise.resolve(null);
  if (!refreshing) {
    const refreshToken = current.refreshToken;
    refreshing = api
      .post('/api/auth/refresh', { refreshToken }, { headers: { Authorization: '' }, timeout: 20_000 })
      .then(async ({ data }) => {
        if (!current) return null;
        await saveSession({ ...current, accessToken: String(data.accessToken), refreshToken: String(data.refreshToken) });
        return current?.accessToken ?? null;
      })
      .catch(async (error: AxiosError) => {
        // Only a definite "no" from the server ends the session; a network problem keeps it.
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          await saveSession(null);
          onExpired?.();
        }
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetryConfig | undefined;
  const url = config?.url ?? '';
  const usedSession = Boolean(current && String(config?.headers?.Authorization ?? '') === `Bearer ${current.accessToken}`);
  const publicAuthRoute = /\/api\/auth\/(login|register|refresh|forgot|reset|logout)/.test(url);
  if (error.response?.status !== 401 || !config || config._retried || !usedSession || publicAuthRoute) {
    throw error;
  }
  config._retried = true;
  const token = await refreshAccessToken();
  if (!token) throw error;
  config.headers.Authorization = `Bearer ${token}`;
  return api.request(config);
});
