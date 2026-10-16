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
import { Pressable, Text, View } from 'react-native';

import { ToastHost } from '@/components/toast';
import { ThemeProvider, useAppTheme } from '@/providers/theme-provider';
import { I18nProvider } from '@/providers/i18n-provider';
import { useArrivalWatch } from '@/services/arrival-watch';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';
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

/**
 * Shown instead of a blank screen if any screen throws unexpectedly. Uses plain components
 * and brand colours because it can render outside the theme and font providers.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F8FAFC' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A', textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, color: '#64748B', textAlign: 'center' }}>
        Your tasks are safe. Please try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{ marginTop: 8, minHeight: 48, paddingHorizontal: 28, borderRadius: 16, justifyContent: 'center', backgroundColor: '#5C4DF2' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateLock = useLockStore((s) => s.hydrate);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    void hydrate();
    void hydrateLock();
  }, [hydrate, hydrateLock]);

  if (!fontsLoaded) {
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
