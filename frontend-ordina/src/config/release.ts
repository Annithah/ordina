/**
 * What this build includes.
 *
 * Version 2 is offline-first: tasks, categories, search, reminders and backup files live on the
 * phone (SQLite) and work without internet. An optional email account adds server backup and
 * sync. ORDINA AI needs the server (and internet).
 *
 * The Play build (EAS "production" / "preview" profiles set EXPO_PUBLIC_STORE_BUILD=1) leaves out
 * older features; app.config.js removes their Android permissions, so it never asks for them.
 */
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';

/** Tasks always live on the phone in version 2 (kept as a flag for older code paths). */
export const LOCAL_MODE = true;

export const FEATURES = {
  /** Google / Apple sign-in: shown as "Coming soon" until they are connected. */
  socialSignIn: false,
  /** Integrations screen: Google Calendar, contacts, location. */
  integrations: !STORE_BUILD,
  /** Local task reminders (notifications on the phone). */
  reminders: true,
  /** Linking phone contacts to tasks ("Call John"). */
  contacts: !STORE_BUILD,
  /** "Remind me when I arrive" (location). */
  arrivalReminders: !STORE_BUILD,
  /** Photo / video to tasks (camera, gallery). */
  mediaToTasks: !STORE_BUILD,
  /** Busy times / events from Google Calendar. */
  googleCalendar: !STORE_BUILD,
  /** Optional email accounts, for server backup and sync. */
  accounts: true,
  /** Version 1 server screens (goals, server reminders, notifications inbox, projects). */
  serverWorkspace: false,
  /** Repeating tasks (expanded by the server in version 1). */
  repeatingTasks: false,
  /** "Plan my day", "What should I do now?" (they read and move server tasks). */
  aiQuickActions: false,
} as const;
