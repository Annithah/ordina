/**
 * Expo config. app.json holds the base settings; this file adjusts them for the
 * Google Play build (EAS profiles "production" and "preview" set EXPO_PUBLIC_STORE_BUILD=1).
 *
 * The store build ships only Daily Task Planning + ORDINA AI (with optional voice), so it
 * drops the native plugins and Android permissions of features that are switched off in
 * src/config/release.ts. Only the microphone remains, requested when the mic is first used.
 */

const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';
// Offline test build: tasks on the phone, ORDINA AI on the developer's laptop over http.
const LOCAL_MODE = process.env.EXPO_PUBLIC_LOCAL_MODE === '1';

/** Allows plain-http requests (laptop on the local Wi-Fi). Used only by the offline test build. */
function withCleartextTraffic(config) {
  const { withAndroidManifest } = require('expo/config-plugins');
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
}

// Plugins whose features are hidden in the store build.
const STORE_EXCLUDED_PLUGINS = new Set([
  'expo-contacts',
  'expo-location',
  'expo-image-picker',
  'expo-notifications',
  'expo-apple-authentication',
]);

// Removed from the final AndroidManifest even if a library declares them.
const STORE_BLOCKED_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
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
  // against a local backend. The offline test build (LOCAL_MODE) uses the laptop's Wi-Fi address.
  if (LOCAL_MODE && !/^http:\/\/[\w.-]+(:\d+)?\/?$/i.test(apiUrl)) {
    throw new Error(`Offline test build needs EXPO_PUBLIC_API_URL set to the laptop address, e.g. http://192.168.1.20:4000 (got "${apiUrl}").`);
  }
  if (!LOCAL_MODE && !isPublicHttpsUrl(apiUrl) && process.env.ORDINA_LOCAL_STORE_PREVIEW !== '1') {
    throw new Error(`Store build needs EXPO_PUBLIC_API_URL set to the HTTPS production backend (got "${apiUrl}").`);
  }

  const blocked = new Set([...(config.android?.blockedPermissions ?? []), ...STORE_BLOCKED_PERMISSIONS]);
  const result = {
    ...config,
    plugins: (config.plugins ?? []).filter((plugin) => !STORE_EXCLUDED_PLUGINS.has(pluginName(plugin))),
    android: {
      ...config.android,
      permissions: ['android.permission.RECORD_AUDIO'],
      blockedPermissions: [...blocked],
    },
  };
  return LOCAL_MODE ? withCleartextTraffic(result) : result;
};
