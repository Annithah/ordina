/**
 * Expo config. app.json holds the base settings; this file adjusts them for the
 * Google Play build (EAS profiles "production" and "preview" set EXPO_PUBLIC_STORE_BUILD=1).
 *
 * The store build ships Daily Task Planning, task reminders and ORDINA AI (voice, photos, files),
 * so it drops the native plugins and Android permissions of features that are switched off in
 * src/config/release.ts. Microphone and notifications are asked for when first used.
 */

const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';
// Test build: tasks live on the phone (SQLite), no ORDINA server.
const LOCAL_MODE = process.env.EXPO_PUBLIC_LOCAL_MODE === '1';
// ORDINA AI: "direct" (default) the phone calls Gemini; "server" through the ORDINA backend.
const AI_SERVER = process.env.EXPO_PUBLIC_AI_MODE === 'server';

// Plugins whose features are hidden in the store build.
const STORE_EXCLUDED_PLUGINS = new Set([
  'expo-contacts',
  'expo-location',
  'expo-apple-authentication',
]);

// Removed from the final AndroidManifest even if a library declares them.
const STORE_BLOCKED_PERMISSIONS = [
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  // USE_EXACT_ALARM is only for alarm-clock and calendar apps on Google Play; ORDINA asks for
  // SCHEDULE_EXACT_ALARM instead (below) and falls back to inexact reminders when it is off.
  'android.permission.USE_EXACT_ALARM',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

/** True for https://public-host.tld URLs; false for localhost, LAN IPs and plain http. */
function isPublicHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname;
  const lan = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/.test(host) || host.endsWith('.local');
  return url.protocol === 'https:' && host.includes('.') && !lan;
}

const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);

module.exports = ({ config }) => {
  if (!STORE_BUILD) return config;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  // ORDINA_LOCAL_STORE_PREVIEW=1 lets a developer preview the store scope with `expo start`
  // against a local backend.
  const needsServer = !LOCAL_MODE || AI_SERVER;
  if (needsServer && !isPublicHttpsUrl(apiUrl) && process.env.ORDINA_LOCAL_STORE_PREVIEW !== '1') {
    throw new Error(`Store build needs EXPO_PUBLIC_API_URL set to the HTTPS production backend (got "${apiUrl}").`);
  }
  // Direct mode ships the Gemini key in the app (copied into SQLite on first start). Never print it.
  if (!AI_SERVER && !String(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim()) {
    throw new Error('ORDINA AI (direct mode) needs EXPO_PUBLIC_GEMINI_API_KEY: add it to .env, or as an EAS environment variable for cloud builds.');
  }

  const blocked = new Set([...(config.android?.blockedPermissions ?? []), ...STORE_BLOCKED_PERMISSIONS]);
  const result = {
    ...config,
    plugins: (config.plugins ?? []).filter((plugin) => !STORE_EXCLUDED_PLUGINS.has(pluginName(plugin))),
    android: {
      ...config.android,
      // Microphone (voice), notifications (task reminders), camera and photos (attach in ORDINA AI).
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        // On-time task reminders on Android 12+ (Settings explains how to allow it when off).
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.CAMERA',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ],
      blockedPermissions: [...blocked],
    },
  };
  return result;
};
