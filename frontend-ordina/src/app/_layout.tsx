import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { NotificationPrompt } from '@/components/notification-prompt';
import { ToastHost } from '@/components/toast';
import { CrashScreen } from '@/crash-guard';
import { ThemeProvider, useAppTheme } from '@/providers/theme-provider';
import { I18nProvider, useI18n } from '@/providers/i18n-provider';
import { loadServerOverride } from '@/services/api';
import { useArrivalWatch } from '@/services/arrival-watch';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationSettings } from '@/store/notification-settings-store';
import { initNotifications, refreshNotificationLanguage } from '@/services/notifications';
import { useCategoriesStore } from '@/store/categories-store';
import { useLockStore } from '@/store/lock-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { FEATURES } from '@/config/release';

function RootStack() {
  const { scheme, colors } = useAppTheme();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const firstName = useAuthStore((s) => s.user?.name?.split(' ')[0] ?? null);
  const { locale } = useI18n();
  useArrivalWatch(isSignedIn && FEATURES.arrivalReminders);

  // Notifications: channels, buttons, listeners and a full re-plan, once.
  useEffect(() => {
    void useNotificationSettings.getState().load();
    let cleanup: (() => void) | undefined;
    void initNotifications({ firstName, locale }).then((stop) => {
      cleanup = stop;
    }).catch(() => undefined);
    return () => cleanup?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Their texts follow the app language and the user's first name.
  const profileSeen = useRef(`${firstName}|${locale}`);
  useEffect(() => {
    const key = `${firstName}|${locale}`;
    if (key === profileSeen.current) return;
    profileSeen.current = key;
    void refreshNotificationLanguage({ firstName, locale });
  }, [firstName, locale]);

  return (
    <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="create-pin" />
        <Stack.Screen name="lock" />
        <Stack.Screen name="language" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="ai-history" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ai" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="search" />
        <Stack.Screen name="new-task" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="schedule-created" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="new-project" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="goals" />
        <Stack.Screen name="reminders" />
        <Stack.Screen name="integrations" />
      </Stack>
      <NotificationPrompt />
      <ToastHost />
    </NavigationThemeProvider>
  );
}

/** Shown instead of closing the app if any screen throws; shows the error so testers can screenshot it. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CrashScreen error={error} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateLock = useLockStore((s) => s.hydrate);
  const loadPreferences = usePreferencesStore((s) => s.load);
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    void hydrate();
    void hydrateLock();
    void loadPreferences();
    void loadServerOverride();
    void useCategoriesStore.getState().load();
  }, [hydrate, hydrateLock, loadPreferences]);

  // If the fonts can't load, continue with the system font instead of a blank screen.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider>
          <I18nProvider>
            <RootStack />
          </I18nProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
