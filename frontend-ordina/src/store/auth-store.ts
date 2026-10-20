/**
 * ORDINA accounts, kept on this phone (there is no account server).
 * An account is a name, an email and a 4-digit passkey; only the passkey's hash is stored.
 * The passkey signs the user in and is also the passkey that opens the app (lock screen).
 * Google and Apple only confirm who the user is; the user still chooses a passkey.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { useLockStore, type PinResult } from '@/store/lock-store';

const KEYS = {
  onboarding: 'ordina.hasSeenOnboarding',
  session: 'ordina.session',
  accounts: 'ordina.accounts.v1',
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

export type AuthProvider = 'email' | 'google' | 'apple';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
};

type Account = AuthUser & {
  /** Hash of the 4-digit passkey; empty until a Google/Apple user has chosen one. */
  pinHash: string | null;
  /** Apple only sends the email the first time, so Apple accounts are found by this id. */
  appleUserId?: string;
  createdAt: string;
};

/** Error with a translation key (auth.errors.<code>) the screens show to the user. */
export class AuthError extends Error {
  constructor(public code: 'exists' | 'notFound' | 'wrong' | 'locked') {
    super(code);
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSKEY_RE = /^\d{4}$/;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function readAccounts(): Promise<Account[]> {
  try {
    const value = await read(KEYS.accounts);
    const parsed = value ? (JSON.parse(value) as Account[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: Account[]) {
  await write(KEYS.accounts, JSON.stringify(accounts));
}

function publicUser(account: Account): AuthUser {
  return { id: account.id, name: account.name, email: account.email, provider: account.provider };
}

type AuthState = {
  hydrated: boolean;
  hasSeenOnboarding: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** New email account; the passkey also becomes the app passkey. */
  signUp: (payload: { name: string; email: string; passkey: string }) => Promise<void>;
  signIn: (credentials: { email: string; passkey: string }) => Promise<void>;
  /**
   * Google / Apple confirmed who the user is. Returns 'needsPasskey' for a new account
   * (choose one next) or 'unlock' for an existing account (enter its passkey next).
   */
  signInWithProvider: (profile: { provider: 'google' | 'apple'; name?: string | null; email?: string | null; appleUserId?: string }) => Promise<'needsPasskey' | 'unlock'>;
  /** Stores a newly chosen passkey on the signed-in account (first time or "Change passkey"). */
  attachPasskey: (hash: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  /** The provider of the account with this email, if it exists on this phone. */
  providerFor: (email: string) => Promise<AuthProvider | null>;
  signOut: () => Promise<void>;
  /** Forgot passkey on an email account: removes every account and the app passkey on this phone. */
  resetAccounts: () => Promise<void>;
};

async function startSession(account: Account) {
  await write(KEYS.session, account.id);
  await write(KEYS.onboarding, '1');
  // The account's passkey is the one that opens the app from now on.
  await useLockStore.getState().setPinHash(account.pinHash);
  useAuthStore.setState({ isSignedIn: true, user: publicUser(account), hasSeenOnboarding: true });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  hasSeenOnboarding: false,
  isSignedIn: false,
  user: null,

  hydrate: async () => {
    const onboarding = await read(KEYS.onboarding);
    const sessionId = await read(KEYS.session);
    const account = sessionId ? (await readAccounts()).find((item) => item.id === sessionId) : undefined;
    // Sessions from older versions (server tokens) are not accounts on this phone: sign in again.
    if (sessionId && !account) await write(KEYS.session, null);
    set({
      hydrated: true,
      hasSeenOnboarding: onboarding === '1',
      isSignedIn: Boolean(account),
      user: account ? publicUser(account) : null,
    });
  },

  completeOnboarding: async () => {
    await write(KEYS.onboarding, '1');
    set({ hasSeenOnboarding: true });
  },

  signUp: async ({ name, email, passkey }) => {
    const accounts = await readAccounts();
    const key = normalizeEmail(email);
    if (accounts.some((account) => account.email === key)) throw new AuthError('exists');
    const pinHash = await useLockStore.getState().createPin(passkey);
    const account: Account = {
      id: Crypto.randomUUID(),
      name: name.trim(),
      email: key,
      provider: 'email',
      pinHash,
      createdAt: new Date().toISOString(),
    };
    await writeAccounts([...accounts, account]);
    await startSession(account);
    useLockStore.getState().markUnlocked();
  },

  signIn: async ({ email, passkey }) => {
    const account = (await readAccounts()).find((item) => item.email === normalizeEmail(email));
    if (!account) throw new AuthError('notFound');
    const result: PinResult = await useLockStore.getState().verifyAgainst(passkey, account.pinHash);
    if (result !== 'ok') throw new AuthError(result);
    await startSession(account);
    useLockStore.getState().markUnlocked();
  },

  signInWithProvider: async ({ provider, name, email, appleUserId }) => {
    const accounts = await readAccounts();
    const key = email ? normalizeEmail(email) : '';
    let account = accounts.find((item) => (appleUserId && item.appleUserId === appleUserId) || (key && item.email === key));
    if (!account) {
      account = {
        id: Crypto.randomUUID(),
        name: (name ?? '').trim() || key.split('@')[0] || 'ORDINA user',
        email: key,
        provider,
        pinHash: null,
        appleUserId,
        createdAt: new Date().toISOString(),
      };
      await writeAccounts([...accounts, account]);
    }
    await startSession(account);
    if (account.pinHash) {
      useLockStore.getState().markLocked();
      return 'unlock';
    }
    return 'needsPasskey';
  },

  attachPasskey: async (hash) => {
    const user = get().user;
    if (!user) return;
    const accounts = await readAccounts();
    await writeAccounts(accounts.map((account) => (account.id === user.id ? { ...account, pinHash: hash } : account)));
  },

  updateName: async (name) => {
    const user = get().user;
    const trimmed = name.trim();
    if (!user || !trimmed) return;
    const accounts = await readAccounts();
    await writeAccounts(accounts.map((account) => (account.id === user.id ? { ...account, name: trimmed } : account)));
    set({ user: { ...user, name: trimmed } });
  },

  providerFor: async (email) => {
    const account = (await readAccounts()).find((item) => item.email === normalizeEmail(email));
    return account?.provider ?? null;
  },

  signOut: async () => {
    await write(KEYS.session, null);
    useLockStore.getState().markLocked();
    set({ isSignedIn: false, user: null });
  },

  resetAccounts: async () => {
    await write(KEYS.accounts, null);
    await write(KEYS.session, null);
    await useLockStore.getState().setPinHash(null);
    useLockStore.getState().markLocked();
    set({ isSignedIn: false, user: null });
  },
}));
