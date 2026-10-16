import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { LOCAL_MODE } from '@/config/release';
import { api, setAuthToken } from '@/services/api';
import { useLockStore } from '@/store/lock-store';

const KEYS = {
  onboarding: 'ordina.hasSeenOnboarding',
  session: 'ordina.session',
};

async function read(key: string) {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null) {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // local session only
  }
}

export type AuthUser = {
  id?: number;
  name: string;
  email: string;
  token?: string;
};

type AuthState = {
  hydrated: boolean;
  hasSeenOnboarding: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (payload: { name: string; email: string; password: string }) => Promise<void>;
  applySession: (data: unknown) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (payload: { identityToken: string; fullName?: { givenName?: string | null; familyName?: string | null } | null }) => Promise<void>;
  signOut: () => Promise<void>;
};

function sessionFrom(data: unknown) {
  const root = data as { data?: Record<string, unknown>; user?: Record<string, unknown>; token?: string };
  const payload = (root.data ?? root) as {
    user?: { id?: number; name?: string; displayName?: string; email?: string };
    token?: string;
  };
  const userPayload = payload.user ?? {};
  return {
    id: userPayload.id,
    name: userPayload.name ?? userPayload.displayName ?? '',
    email: userPayload.email ?? '',
    token: payload.token,
  } as AuthUser;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  hasSeenOnboarding: false,
  isSignedIn: false,
  user: null,

  hydrate: async () => {
    const onboarding = await read(KEYS.onboarding);
    if (LOCAL_MODE) {
      // Offline test build: no accounts. The phone itself is the user; tasks stay on it.
      set({ hydrated: true, hasSeenOnboarding: onboarding === '1', isSignedIn: true, user: { name: '', email: '' } });
      return;
    }
    const session = await read(KEYS.session);
    let user: AuthUser | null = null;
    if (session) {
      try {
        const parsed = JSON.parse(session) as AuthUser;
        user = parsed?.token ? parsed : null;
      } catch {
        user = null;
      }
    }
    if (!user && session) await write(KEYS.session, null);
    set({
      hydrated: true,
      hasSeenOnboarding: onboarding === '1',
      isSignedIn: Boolean(user),
      user,
    });
    setAuthToken(user?.token);
  },

  completeOnboarding: async () => {
    await write(KEYS.onboarding, '1');
    set({ hasSeenOnboarding: true });
  },

  applySession: async (data) => {
    const user = sessionFrom(data);
    await write(KEYS.session, JSON.stringify(user));
    await write(KEYS.onboarding, '1');
    setAuthToken(user.token);
    set({ isSignedIn: true, user, hasSeenOnboarding: true });
  },

  signIn: async ({ email, password }) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    await useAuthStore.getState().applySession(data);
  },

  signUp: async ({ name, email, password }) => {
    const { data } = await api.post('/api/auth/register', { name, email, password });
    const user = sessionFrom(data);
    if (!user.name) user.name = name;
    await useAuthStore.getState().applySession({ ...data, user });
  },

  signInWithGoogle: async (idToken) => {
    const { data } = await api.post('/api/auth/google', { idToken });
    await useAuthStore.getState().applySession(data);
  },

  signInWithApple: async (payload) => {
    const { data } = await api.post('/api/auth/apple', payload);
    await useAuthStore.getState().applySession(data);
  },

  signOut: async () => {
    await write(KEYS.session, null);
    setAuthToken();
    useLockStore.getState().markLocked();
    set({ isSignedIn: false, user: null });
  },
}));
