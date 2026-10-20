import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import {
  DEFAULT_LOCALE,
  LANGUAGE_KEY,
  deviceLocale,
  interpolate,
  isLocale,
  translations,
  type LocaleId,
  type PartialTranslation,
} from '@/i18n/translations';

type I18nValue = {
  locale: LocaleId;
  /** False until the saved language has been read, so screens don't flash in another language. */
  ready: boolean;
  setLocale: (locale: LocaleId) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

async function readLocale(): Promise<LocaleId | null> {
  try {
    const value =
      Platform.OS === 'web' && typeof localStorage !== 'undefined'
        ? localStorage.getItem(LANGUAGE_KEY)
        : await SecureStore.getItemAsync(LANGUAGE_KEY);
    // A language that was removed (e.g. Kinyarwanda) counts as no choice.
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
    // ignore
  }
}

function lookup(tree: PartialTranslation, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = tree;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(deviceLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void readLocale().then((stored) => {
      if (stored) setLocaleState(stored);
      setReady(true);
    });
  }, []);

  const setLocale = useCallback((next: LocaleId) => {
    setLocaleState(next);
    void writeLocale(next);
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      const value =
        lookup(translations[locale], path) ?? lookup(translations.en, path) ?? path;
      return vars ? interpolate(value, vars) : value;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, ready, setLocale, t }), [locale, ready, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      ready: true,
      setLocale: () => {},
      t: (path: string, vars?: Record<string, string | number>) => {
        const value = lookup(translations.en, path) ?? path;
        return vars ? interpolate(value, vars) : value;
      },
    };
  }
  return context;
}
