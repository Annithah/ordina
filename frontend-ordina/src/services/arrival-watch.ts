import * as Location from 'expo-location';
import { useEffect } from 'react';

import { api } from '@/services/api';
import { presentImmediateNotification } from '@/services/notifications';

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type ArrivalReminder = {
  id: number;
  title: string;
  kind?: string;
  enabled?: boolean;
  completed?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
};

export function useArrivalWatch(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let subscription: { remove: () => void } | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let permissionAttempted = false;
    let locationStarted = false;
    const fired = new Set<number>();
    let arrivals: ArrivalReminder[] = [];

    async function loadArrivals(): Promise<ArrivalReminder[]> {
      const { data } = await api.get('/api/reminders');
      return ((data.reminders || []) as ArrivalReminder[]).filter(
        (row) => row.kind === 'arrival' && row.enabled !== false && !row.completed && row.latitude != null && row.longitude != null,
      );
    }

    async function startWatching() {
      if (cancelled || locationStarted || !arrivals.length || permissionAttempted) return;
      permissionAttempted = true;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      locationStarted = true;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15000 },
        async (position) => {
          const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          for (const reminder of arrivals) {
            if (fired.has(reminder.id) || reminder.latitude == null || reminder.longitude == null) continue;
            const meters = haversineMeters(here, { latitude: reminder.latitude, longitude: reminder.longitude });
            if (meters <= (reminder.radiusMeters || 150)) {
              fired.add(reminder.id);
              try {
                await presentImmediateNotification('ORDINA', reminder.title);
                await api.patch(`/api/reminders/${reminder.id}`, { completed: true, enabled: false });
              } catch (error) {
                console.error(`Unable to complete arrival reminder ${reminder.id}:`, error);
              }
            }
          }
        },
      );
    }

    async function refreshArrivals() {
      try {
        arrivals = await loadArrivals();
      } catch (error) {
        console.error('Unable to refresh arrival reminders:', error);
        return;
      }
      await startWatching();
    }

    void refreshArrivals().catch((error) => console.error('Unable to start arrival reminder monitoring:', error));
    refreshTimer = setInterval(() => {
      void refreshArrivals().catch((error) => console.error('Unable to refresh arrival reminders:', error));
    }, 60000);
    return () => {
      cancelled = true;
      subscription?.remove();
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [enabled]);
}
