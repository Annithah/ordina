/**
 * App preferences, saved in the phone database (app_settings) so they are part of the backup
 * file. Theme and language keep their own storage (they are needed before the database opens).
 */
import { create } from 'zustand';

import { OTHER_CATEGORY_ID } from '@/logic/categories';
import { DEFAULT_FILTERS, sanitizeFilters, type TaskFilters, type WeekStart } from '@/logic/filters';
import { isReminderOption, type ReminderOption } from '@/logic/reminders';
import { readAllSettings, writeSetting } from '@/services/local-tasks';

export type TaskView = 'time' | 'category';
export type BackupFrequency = 'weekly' | 'monthly';

export type Settings = {
  weekStart: WeekStart;
  defaultView: TaskView;
  /** Minutes, or null for "no duration". */
  defaultDuration: number | null;
  defaultCategoryId: string;
  remindersEnabled: boolean;
  defaultReminder: ReminderOption;
  backupReminderEnabled: boolean;
  backupFrequency: BackupFrequency;
  /** ISO time of the last exported backup file. */
  lastExportAt: string | null;
  /** The home page's last view and filters (remembered on the device). */
  homeView: TaskView | null;
  homeFilters: TaskFilters;
  collapsedCategories: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  weekStart: 'monday',
  defaultView: 'time',
  defaultDuration: null,
  defaultCategoryId: OTHER_CATEGORY_ID,
  remindersEnabled: true,
  defaultReminder: 'none',
  backupReminderEnabled: true,
  backupFrequency: 'weekly',
  lastExportAt: null,
  homeView: null,
  homeFilters: DEFAULT_FILTERS,
  collapsedCategories: [],
};

/** Reads saved values, keeping defaults for anything missing or invalid. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const s = DEFAULT_SETTINGS;
  const pick = <K extends keyof Settings>(key: K, valid: (v: unknown) => boolean): Settings[K] => (valid(raw[key]) ? (raw[key] as Settings[K]) : s[key]);
  const duration = raw.defaultDuration;
  return {
    weekStart: pick('weekStart', (v) => v === 'monday' || v === 'sunday'),
    defaultView: pick('defaultView', (v) => v === 'time' || v === 'category'),
    defaultDuration: duration === null || (typeof duration === 'number' && duration >= 5 && duration <= 720) ? (duration as number | null) : s.defaultDuration,
    defaultCategoryId: pick('defaultCategoryId', (v) => typeof v === 'string' && v.length > 0),
    remindersEnabled: pick('remindersEnabled', (v) => typeof v === 'boolean'),
    defaultReminder: pick('defaultReminder', isReminderOption),
    backupReminderEnabled: pick('backupReminderEnabled', (v) => typeof v === 'boolean'),
    backupFrequency: pick('backupFrequency', (v) => v === 'weekly' || v === 'monthly'),
    lastExportAt: pick('lastExportAt', (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)))),
    homeView: pick('homeView', (v) => v === null || v === 'time' || v === 'category'),
    homeFilters: raw.homeFilters === undefined ? s.homeFilters : sanitizeFilters(raw.homeFilters),
    collapsedCategories: Array.isArray(raw.collapsedCategories) ? raw.collapsedCategories.filter((v): v is string => typeof v === 'string') : s.collapsedCategories,
  };
}

type SettingsState = Settings & {
  loaded: boolean;
  load: () => Promise<void>;
  update: (changes: Partial<Settings>) => Promise<void>;
};

const listeners = new Set<(changes: Partial<Settings>) => void>();

/** Lets services react to setting changes (e.g. reminders off cancels notifications). */
export function onSettingsChanged(listener: (changes: Partial<Settings>) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    try {
      set({ ...sanitizeSettings(await readAllSettings()), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: async (changes) => {
    set(changes);
    await Promise.all(Object.entries(changes).map(([key, value]) => writeSetting(key, value))).catch(() => undefined);
    for (const listener of listeners) listener(changes);
  },
}));

export const getSettings = () => useSettingsStore.getState();
