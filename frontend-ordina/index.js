// App entry. Same as expo-router/entry, plus a crash guard: if the app fails while loading
// or rendering, testers see the error on screen instead of "ORDINA AI keeps stopping".
// `require` (not `import`) so the guard is installed before any app code runs.
const { installCrashGuard, withCrashGuard, crashRoot } = require('./src/crash-guard');

installCrashGuard();

// Notification buttons pressed while the app is closed are handled by this background task;
// it must be defined when the bundle loads.
try {
  require('./src/services/notification-task');
} catch {
  // Notifications are optional; the app still opens.
}

const { renderRootComponent } = require('expo-router/build/renderRootComponent');

let Root;
try {
  require('@expo/metro-runtime');
  Root = withCrashGuard(require('expo-router/build/qualified-entry').App);
} catch (error) {
  Root = crashRoot(error);
}

renderRootComponent(Root);
