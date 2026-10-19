/**
 * Optional email account. The app works fully without one; an account adds server backup and
 * sync. Signing out never deletes tasks on the phone.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { api } from '@/services/api';
import { getSession, loadSession, saveSession, setSessionExpiredHandler, type SessionUser } from '@/services/session';

const ONBOARDING_KEY = 'ordina.hasSeenOnboarding';

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
    // Not saved: the intro may show again next time.
  }
}

export type AuthUser = SessionUser;

type SignedInListener = (signedIn: boolean) => void;
const listeners = new Set<SignedInListener>();

/** Sync and backup reminders follow sign-in and sign-out. */
export function onAuthChanged(listener: SignedInListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type AuthState = {
  hydrated: boolean;
  hasSeenOnboarding: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (payload: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (payload: { email: string; code: string; password: string }) => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

function notify(signedIn: boolean) {
  for (const listener of listeners) {
    try {
      listener(signedIn);
    } catch {
      // A listener problem never blocks signing in or out.
    }
  }
}

async function applySession(data: { user: SessionUser; accessToken: string; refreshToken: string }) {
  await saveSession({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
  useAuthStore.setState({ isSignedIn: true, user: data.user });
  notify(true);
}

async function clearLocalSession() {
  await saveSession(null);
  useAuthStore.setState({ isSignedIn: false, user: null });
  notify(false);
}

setSessionExpiredHandler(() => {
  useAuthStore.setState({ isSignedIn: false, user: null });
  notify(false);
});

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  hasSeenOnboarding: false,
  isSignedIn: false,
  user: null,

  hydrate: async () => {
    const [onboarding, session] = await Promise.all([read(ONBOARDING_KEY), loadSession()]);
    set({ hydrated: true, hasSeenOnboarding: onboarding === '1', isSignedIn: Boolean(session), user: session?.user ?? null });
    if (session) notify(true);
  },

  completeOnboarding: async () => {
    await write(ONBOARDING_KEY, '1');
    set({ hasSeenOnboarding: true });
  },

  signIn: async ({ email, password }) => {
    const { data } = await api.post('/api/auth/login', { email: email.trim(), password });
    await applySession(data);
  },

  signUp: async ({ name, email, password }) => {
    const { data } = await api.post('/api/auth/register', { name: name.trim(), email: email.trim(), password });
    await applySession(data);
  },

  signOut: async () => {
    const session = getSession();
    // Tell the server to forget the refresh token; signing out works offline too.
    if (session) void api.post('/api/auth/logout', { refreshToken: session.refreshToken }, { timeout: 10_000 }).catch(() => undefined);
    await clearLocalSession();
  },

  requestPasswordReset: async (email) => {
    await api.post('/api/auth/forgot', { email: email.trim() });
  },

  resetPassword: async ({ email, code, password }) => {
    await api.post('/api/auth/reset', { email: email.trim(), code: code.trim(), newPassword: password });
  },

  changePassword: async ({ currentPassword, newPassword }) => {
    const { data } = await api.post('/api/auth/change-password', { currentPassword, newPassword });
    // Other phones are signed out; this one gets fresh tokens.
    if (data?.accessToken && data?.refreshToken) await applySession({ user: data.user ?? useAuthStore.getState().user!, ...data });
  },

  deleteAccount: async (password) => {
    await api.delete('/api/auth/account', { data: { password } });
    await clearLocalSession();
  },
}));
