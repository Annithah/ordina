import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOCAL_URL = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** In development, the computer serving the app over Wi-Fi also runs the API, so follow its current IP. */
function devLanApiUrl(): string | null {
  if (!__DEV__) return null;
  const host = (Constants.expoConfig?.hostUri as string | undefined)?.split(':')[0];
  if (!host || !/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('127.')) return null;
  return `http://${host}:4000`;
}

function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  // Release builds (Google Play) only ever talk to the HTTPS production backend, never a
  // laptop or LAN address. The value comes from eas.json and app.config.js checks it.
  // Exception: the offline test build (EXPO_PUBLIC_LOCAL_MODE=1) talks to the developer's laptop
  // over plain http on Wi-Fi, for ORDINA AI only.
  if (!__DEV__ && process.env.EXPO_PUBLIC_LOCAL_MODE === '1') return configuredUrl ?? '';
  if (!__DEV__) return configuredUrl && /^https:\/\//i.test(configuredUrl) ? configuredUrl : '';
  if (configuredUrl && LOCAL_URL.test(configuredUrl)) return devLanApiUrl() ?? configuredUrl;
  if (configuredUrl) return configuredUrl;

  const extraApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extraApiUrl) return extraApiUrl;

  const hostUri = Constants.expoConfig?.hostUri as string | undefined;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && !host.startsWith('127.')) {
      return `http://${host}:4000`;
    }
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  if (Platform.OS === 'ios') return 'http://127.0.0.1:4000';
  return 'http://localhost:4000';
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * The free production backend (Render) sleeps after 15 idle minutes and takes about a minute
 * to wake, so release builds wait that much longer before giving up. When the phone is
 * offline, requests still fail immediately.
 */
export const COLD_START_MS = __DEV__ ? 0 : 70_000;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000 + COLD_START_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// The ORDINA AI server address can be changed in Settings (e.g. the laptop got a new Wi-Fi
// address) without a new build. Saved on the phone; empty means the built-in address.
const SERVER_KEY = 'ordina.aiServer.v1';

export function currentApiBaseUrl() {
  return String(api.defaults.baseURL ?? '');
}

/** "10.0.0.5:4000" or "http://10.0.0.5:4000/" -> "http://10.0.0.5:4000"; null if it isn't an address. */
export function normalizeServerUrl(value: string): string | null {
  const text = value.trim().replace(/\/+$/, '');
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    return url.hostname ? `${url.protocol}//${url.host}` : null;
  } catch {
    return null;
  }
}

async function storage() {
  return import('expo-secure-store');
}

/** Uses the address saved in Settings, if any. Called once at startup. */
export async function loadServerOverride() {
  try {
    const saved = await (await storage()).getItemAsync(SERVER_KEY);
    if (saved) api.defaults.baseURL = saved;
  } catch {
    // keep the built-in address
  }
}

/** Saves a new server address (null = back to the built-in one) and uses it right away. */
export async function saveServerOverride(url: string | null) {
  const store = await storage();
  if (url) await store.setItemAsync(SERVER_KEY, url);
  else await store.deleteItemAsync(SERVER_KEY);
  api.defaults.baseURL = url ?? API_BASE_URL;
}

/** True when this phone can reach the server at the address (5 second limit). */
export async function canReachServer(url: string) {
  try {
    const response = await axios.get(`${url}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

export function setAuthToken(token?: string) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export async function getHealth() {
  const response = await api.get('/api/health');
  return response.data;
}
