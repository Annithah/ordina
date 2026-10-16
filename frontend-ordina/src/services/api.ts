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

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setAuthToken(token?: string) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export async function getHealth() {
  const response = await api.get('/api/health');
  return response.data;
}
