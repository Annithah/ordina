/**
 * Android helpers for on-time reminders (local native module, see android/). Every function has a
 * safe fallback, so the app works the same where the module is missing (web, Expo Go).
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

type OrdinaAlarmsModule = {
  canScheduleExactAlarms(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openExactAlarmSettings(): boolean;
  openBatterySettings(): boolean;
};

const native = requireOptionalNativeModule<OrdinaAlarmsModule>('OrdinaAlarms');

function safe<T>(call: () => T, fallback: T): T {
  try {
    return native ? call() : fallback;
  } catch {
    return fallback;
  }
}

/** False on Android 12+ when "Alarms & reminders" is off for ORDINA (reminders may be late). */
export const canScheduleExactAlarms = () => safe(() => native!.canScheduleExactAlarms(), true);
/** False when Android may stop ORDINA in the background to save battery. */
export const isIgnoringBatteryOptimizations = () => safe(() => native!.isIgnoringBatteryOptimizations(), true);
export const openExactAlarmSettings = () => safe(() => native!.openExactAlarmSettings(), false);
export const openBatterySettings = () => safe(() => native!.openBatterySettings(), false);
export const hasAlarmsModule = () => Boolean(native);
