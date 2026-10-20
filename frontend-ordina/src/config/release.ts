/**
 * Google Play release scope.
 *
 * The Play build (EAS "production" / "preview" profiles set EXPO_PUBLIC_STORE_BUILD=1)
 * ships only Daily Task Planning and the ORDINA AI assistant (with optional voice).
 * Older features stay in the code but are switched off here, and app.config.js
 * removes their Android permissions, so the store build never asks for them.
 */
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';

/**
 * Development test build (EXPO_PUBLIC_LOCAL_MODE=1): no accounts and no cloud server.
 * Tasks live on the phone in SQLite (works fully offline). Only ORDINA AI talks to the
 * backend running on the developer's laptop (EXPO_PUBLIC_API_URL, plain http on Wi-Fi).
 */
export const LOCAL_MODE = process.env.EXPO_PUBLIC_LOCAL_MODE === '1';

export const FEATURES = {
  /** Google / Apple sign-in buttons (email accounts are always available). */
  socialSignIn: !STORE_BUILD,
  /** Integrations screen: Google Calendar, contacts, location, notifications. */
  integrations: !STORE_BUILD,
  /** Local reminders and task notifications. */
  reminders: !STORE_BUILD,
  /** Linking phone contacts to tasks ("Call John"). */
  contacts: !STORE_BUILD,
  /** "Remind me when I arrive" (location). */
  arrivalReminders: !STORE_BUILD,
  /** Photo / video to tasks (camera, gallery). */
  mediaToTasks: !STORE_BUILD,
  /** Busy times / events from Google Calendar. */
  googleCalendar: !STORE_BUILD,
  /** Email accounts, sign-in and server-side task storage. */
  accounts: !LOCAL_MODE,
  /** Goals, server reminders, notifications inbox and projects (server data). */
  serverWorkspace: !LOCAL_MODE,
  /** Repeating tasks (expanded by the server). */
  repeatingTasks: !LOCAL_MODE,
  /** "Plan my day", "What should I do now?" etc. (they read and move server tasks). */
  aiQuickActions: !LOCAL_MODE,
} as const;
