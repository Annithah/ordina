import { router } from 'expo-router';
import { href } from '@/utils/href';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/brand-lockup';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';

export default function SplashScreen() {
  const { hydrated, hasSeenOnboarding, isSignedIn } = useAuthStore();
  const lockHydrated = useLockStore((s) => s.hydrated);
  const hasPin = useLockStore((s) => s.hasPin);
  const unlocked = useLockStore((s) => s.unlocked);
  const remainingMs = useLockStore((s) => s.remainingMs);

  useEffect(() => {
    if (!hydrated || !lockHydrated) return;
    const timer = setTimeout(() => {
      if (!hasSeenOnboarding) {
        router.replace(href('/onboarding'));
        return;
      }
      if (!isSignedIn) {
        router.replace(href('/sign-in'));
        return;
      }
      if (!hasPin) {
        router.replace(href('/create-pin'));
        return;
      }
      if (!unlocked || remainingMs() > 0) {
        router.replace(href('/lock'));
        return;
      }
      router.replace(href('/(tabs)'));
    }, 1400);
    return () => clearTimeout(timer);
  }, [hydrated, lockHydrated, hasSeenOnboarding, isSignedIn, hasPin, unlocked, remainingMs]);

  return (
    <View style={styles.screen}>
      <BrandLockup markSize={168} wordmarkSize="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
});
