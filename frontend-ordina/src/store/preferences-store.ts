import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

const KEY = 'ordina.onboardingAnswers.v1';

/** What the user told ORDINA during onboarding (question id → chosen option ids). */
export type OnboardingAnswers = Record<string, string[]>;

async function read() {
  try {
    const value = Platform.OS === 'web'
      ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY))
      : await SecureStore.getItemAsync(KEY);
    return value ? (JSON.parse(value) as OnboardingAnswers) : {};
  } catch {
    return {};
  }
}

async function write(value: OnboardingAnswers) {
  try {
    const serialized = JSON.stringify(value);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, serialized);
      return;
    }
    await SecureStore.setItemAsync(KEY, serialized);
  } catch {
    // Preferences are a convenience; failing to store them must not block onboarding.
  }
}

type PreferencesState = {
  answers: OnboardingAnswers;
  load: () => Promise<void>;
  saveAnswers: (answers: OnboardingAnswers) => Promise<void>;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  answers: {},
  load: async () => set({ answers: await read() }),
  saveAnswers: async (answers) => {
    set({ answers });
    await write(answers);
  },
}));
