import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/brand-lockup';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';

/**
 * Start screen: the intro on first launch, the passkey screen if the user set one, otherwise
 * straight to Home. No account is needed.
 */
export default function SplashScreen() {
  const theme = useTheme();
  const { ready } = useI18n();
  const { hydrated, hasSeenOnboarding } = useAuthStore();
  const lockHydrated = useLockStore((s) => s.hydrated);
  const hasPin = useLockStore((s) => s.hasPin);
  const unlocked = useLockStore((s) => s.unlocked);
  const remainingMs = useLockStore((s) => s.remainingMs);

  useEffect(() => {
    if (!hydrated || !lockHydrated || !ready) return;
    const timer = setTimeout(() => {
      if (!hasSeenOnboarding) router.replace('/onboarding');
      else if (hasPin && (!unlocked || remainingMs() > 0)) router.replace('/lock');
      else router.replace('/(tabs)');
    }, 700);
    return () => clearTimeout(timer);
  }, [hydrated, lockHydrated, ready, hasSeenOnboarding, hasPin, unlocked, remainingMs]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BrandLockup markSize={168} wordmarkSize="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
