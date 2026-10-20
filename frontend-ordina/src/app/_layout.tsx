import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ToastHost } from '@/components/toast';
import { CrashScreen } from '@/crash-guard';
import { ThemeProvider, useAppTheme } from '@/providers/theme-provider';
import { I18nProvider } from '@/providers/i18n-provider';
import { useArrivalWatch } from '@/services/arrival-watch';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { FEATURES } from '@/config/release';

function RootStack() {
  const { scheme, colors } = useAppTheme();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  useArrivalWatch(isSignedIn && FEATURES.arrivalReminders);

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
  }, [hydrate, hydrateLock, loadPreferences]);

  // If the fonts can't load, continue with the system font instead of a blank screen.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <I18nProvider>
        <RootStack />
      </I18nProvider>
    </ThemeProvider>
  );
}
