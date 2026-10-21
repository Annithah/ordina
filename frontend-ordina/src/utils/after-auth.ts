import { router } from 'expo-router';

import { useLockStore } from '@/store/lock-store';
import { href } from '@/utils/href';

/** After sign-in: choose a passkey (new Google/Apple account), enter it (returning one), or go in. */
export function routeAfterAuth() {
  const { hasPin, unlocked } = useLockStore.getState();
  if (!hasPin) {
    router.replace(href('/create-pin'));
    return;
  }
  if (!unlocked) {
    router.replace(href('/lock'));
    return;
  }
  router.replace(href('/(tabs)'));
}
