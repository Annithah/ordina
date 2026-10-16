/**
 * Offline mode (LOCAL_MODE): ORDINA AI runs on the developer's laptop. The phone has no account,
 * so it identifies itself with a random device id (kept in secure storage) and gets a token that
 * is used only for AI requests. Tasks never leave the phone except as AI context.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { api } from '@/services/api';

const DEVICE_ID_KEY = 'ordina.deviceId';
export const LAPTOP_MESSAGE = 'ORDINA AI needs the laptop server right now.';

export class LaptopUnreachableError extends Error {
  code = 'LAPTOP_UNREACHABLE';
  constructor() {
    super(LAPTOP_MESSAGE);
  }
}

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

/** No response at all (laptop off, other Wi-Fi, firewall, timeout): the laptop is unreachable. */
export function isUnreachable(error: unknown) {
  const err = error as { response?: unknown; code?: string };
  return !err?.response || err?.code === 'ECONNABORTED';
}

/** Quick reachability check so the user is not left waiting when the laptop is off. */
export async function ensureLaptopServer() {
  try {
    await api.get('/health', { timeout: 5000 });
  } catch {
    throw new LaptopUnreachableError();
  }
}

async function deviceToken(refresh = false) {
  if (token && !refresh) return token;
  const { data } = await api.post('/api/device/session', { deviceId: await deviceId() }, { timeout: 10_000 });
  token = String(data.token);
  return token;
}

/**
 * Runs an AI request against the laptop with the device token. Unreachable laptop becomes a
 * LaptopUnreachableError; an expired token is renewed once.
 */
export async function withLaptop<T>(request: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  await ensureLaptopServer();
  try {
    try {
      return await request({ Authorization: `Bearer ${await deviceToken()}` });
    } catch (error: any) {
      if (error?.response?.status !== 401) throw error;
      return await request({ Authorization: `Bearer ${await deviceToken(true)}` });
    }
  } catch (error) {
    if (isUnreachable(error)) throw new LaptopUnreachableError();
    throw error;
  }
}
