/**
 * ORDINA translations: English (fallback), French and Kinyarwanda.
 *
 * - Every user-facing text lives in en.ts / fr.ts / rw.ts under the same keys. fr and rw are
 *   typed against en, so a missing key fails the type check, and i18n.test.mjs checks it too.
 * - `t('home.title')`, `t('tasks.count', { count: 3 })`: with a numeric `count`, the key
 *   `<key>_one` or `<key>_other` is used when it exists.
 * - `translate()` works outside React (notifications, the task store); the provider keeps it on
 *   the current language.
 *
 * No React Native imports, so the unit tests run with plain Node.
 */
import en from './en.ts';
import fr from './fr.ts';
import rw from './rw.ts';

export const LANGUAGES = [
  { id: 'en', native: 'English' },
  { id: 'fr', native: 'Français' },
  { id: 'rw', native: 'Ikinyarwanda' },
] as const;

export type LocaleId = (typeof LANGUAGES)[number]['id'];
export type TranslationTree = typeof en;
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: string, vars?: TranslateVars) => string;

export const DEFAULT_LOCALE: LocaleId = 'en';
export const LANGUAGE_KEY = 'ordina.language.v1';

export const translations: Record<LocaleId, TranslationTree> = { en, fr, rw };

export function isLocale(value: unknown): value is LocaleId {
  return typeof value === 'string' && value in translations;
}

/** The phone's first supported language ("fr-RW" -> fr, "rw" -> rw), else English. */
export function pickLocale(deviceLanguages: (string | null | undefined)[]): LocaleId {
  for (const tag of deviceLanguages) {
    const code = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

function lookup(tree: unknown, key: string): string | undefined {
  let current: unknown = tree;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(template: string, vars: TranslateVars) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translateIn(locale: LocaleId, key: string, vars?: TranslateVars) {
  const find = (k: string) => lookup(translations[locale], k) ?? lookup(translations.en, k);
  let value: string | undefined;
  if (vars && typeof vars.count === 'number') value = find(`${key}_${vars.count === 1 ? 'one' : 'other'}`);
  value = value ?? find(key) ?? key;
  return vars ? interpolate(value, vars) : value;
}

let currentLocale: LocaleId = DEFAULT_LOCALE;

export function setCurrentLocale(locale: LocaleId) {
  currentLocale = locale;
}

export function currentLocaleId() {
  return currentLocale;
}

/** Translate in the language the app currently shows. */
export const translate: Translate = (key, vars) => translateIn(currentLocale, key, vars);

/** Every key path in a tree ("home.title", ...), for the missing-key test. */
export function keyPaths(tree: unknown, prefix = ''): string[] {
  if (!tree || typeof tree !== 'object') return [];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') return [path];
    if (Array.isArray(value)) return [path];
    return keyPaths(value, path);
  });
}
