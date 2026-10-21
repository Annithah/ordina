import { create } from 'zustand';

import { DEFAULT_SETTINGS, type NotificationSettings } from '@/features/notification-plan';
import { setMeta } from '@/services/local-tasks';
import { SETTINGS_KEY, getSettings, refreshActionButtons, requestReschedule } from '@/services/notifications';

type State = {
  settings: NotificationSettings;
  load: () => Promise<void>;
  /** Saves a change and re-plans every notification. */
  update: (patch: Partial<NotificationSettings>) => Promise<void>;
};

export const useNotificationSettings = create<State>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  load: async () => {
    try {
      set({ settings: await getSettings() });
    } catch {
      // Defaults keep working.
    }
  },
  update: async (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await setMeta(SETTINGS_KEY, settings);
    if (patch.snoozeMinutes !== undefined) void refreshActionButtons();
    requestReschedule('settings');
  },
}));
