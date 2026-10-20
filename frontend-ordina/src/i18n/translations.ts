import { ar } from './locales/ar';
import { de } from './locales/de';
import { en, type TranslationTree } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { pt } from './locales/pt';
import { sw } from './locales/sw';
import { zh } from './locales/zh';

// Kinyarwanda is paused until the texts have been checked by a native speaker.
export const LOCALES = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'fr', label: 'French', native: 'Français' },
  { id: 'es', label: 'Spanish', native: 'Español' },
  { id: 'pt', label: 'Portuguese', native: 'Português' },
  { id: 'de', label: 'German', native: 'Deutsch' },
  { id: 'sw', label: 'Swahili', native: 'Kiswahili' },
  { id: 'ar', label: 'Arabic', native: 'العربية' },
  { id: 'zh', label: 'Chinese', native: '中文' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
] as const;

export type LocaleId = (typeof LOCALES)[number]['id'];
export type { TranslationTree };

/** Same shape as English, but any text may be missing (it then shows in English). */
export type PartialTranslation<T = TranslationTree> = { [K in keyof T]?: T[K] extends string ? string : PartialTranslation<T[K]> };

export const DEFAULT_LOCALE: LocaleId = 'en';
export const LANGUAGE_KEY = 'ordina.language.v1';

export const translations: Record<LocaleId, PartialTranslation> = { en, fr, es, pt, de, sw, ar, zh, hi };

export function isLocale(value: unknown): value is LocaleId {
  return typeof value === 'string' && LOCALES.some((item) => item.id === value);
}

/** The phone's language if ORDINA supports it ("fr-FR" -> "fr"), otherwise English. */
export function deviceLocale(): LocaleId {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const base = tag.split(/[-_]/)[0]?.toLowerCase();
    return isLocale(base) ? base : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function localeName(id: LocaleId) {
  return LOCALES.find((item) => item.id === id)?.native ?? 'English';
}

export function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}
