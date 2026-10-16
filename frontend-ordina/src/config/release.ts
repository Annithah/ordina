/**
 * Google Play release scope.
 *
 * The Play build (EAS "production" / "preview" profiles set EXPO_PUBLIC_STORE_BUILD=1)
 * ships only Daily Task Planning and the ORDINA AI assistant (with optional voice).
 * Older features stay in the code but are switched off here, and app.config.js
 * removes their Android permissions, so the store build never asks for them.
 */
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';

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
} as const;
