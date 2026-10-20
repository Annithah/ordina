/**
 * The app's language. First launch: the phone's language if ORDINA supports it, else English.
 * The choice is saved on the phone, and changing it re-renders the whole app at once.
 */
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  DEFAULT_LOCALE,
  LANGUAGE_KEY,
  isLocale,
  pickLocale,
  setCurrentLocale,
  translateIn,
  type LocaleId,
  type Translate,
} from '@/i18n';

type I18nValue = {
  locale: LocaleId;
  /** False until the saved (or phone) language is known, so nothing flashes in English first. */
  ready: boolean;
  setLocale: (locale: LocaleId) => void;
  t: Translate;
};

const I18nContext = createContext<I18nValue | null>(null);

async function readLocale(): Promise<LocaleId | null> {
  try {
    const value =
      Platform.OS === 'web' && typeof localStorage !== 'undefined'
        ? localStorage.getItem(LANGUAGE_KEY)
        : await SecureStore.getItemAsync(LANGUAGE_KEY);
    // Older builds offered more languages; anything unsupported falls back to the phone language.
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeLocale(locale: LocaleId) {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(LANGUAGE_KEY, locale);
      return;
    }
    await SecureStore.setItemAsync(LANGUAGE_KEY, locale);
  } catch {
    // Not saved: the choice still applies until the app closes.
  }
}

function phoneLocale(): LocaleId {
  try {
    return pickLocale(getLocales().map((item) => item.languageTag ?? item.languageCode));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(() => {
    const initial = phoneLocale();
    setCurrentLocale(initial);
    return initial;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void readLocale().then((stored) => {
      if (stored) {
        setCurrentLocale(stored);
        setLocaleState(stored);
      }
      setReady(true);
    });
  }, []);

  const setLocale = useCallback((next: LocaleId) => {
    setCurrentLocale(next);
    setLocaleState(next);
    void writeLocale(next);
  }, []);

  const t = useCallback<Translate>((key, vars) => translateIn(locale, key, vars), [locale]);

  const value = useMemo(() => ({ locale, ready, setLocale, t }), [locale, ready, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      ready: true,
      setLocale: () => {},
      t: (key, vars) => translateIn(DEFAULT_LOCALE, key, vars),
    };
  }
  return context;
}
