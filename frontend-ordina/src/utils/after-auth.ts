import { router } from 'expo-router';

import { useLockStore } from '@/store/lock-store';
import { href } from '@/utils/href';

export function routeAfterAuth() {
  const { hasPin, markUnlocked } = useLockStore.getState();
  if (!hasPin) {
    router.replace(href('/create-pin'));
    return;
  }
  markUnlocked();
  router.replace(href('/(tabs)'));
}
