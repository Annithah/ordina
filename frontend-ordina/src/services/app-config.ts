/**
 * App settings that ship inside the app and live in the phone's SQLite (table app_config).
 *
 * ORDINA AI's Gemini key and model are put into the build from EXPO_PUBLIC_GEMINI_API_KEY and
 * EXPO_PUBLIC_GEMINI_MODEL (.env locally, EAS environment variables for cloud builds). On every
 * start the bundled values are copied into SQLite when missing or changed (e.g. an update with a
 * new key). Never log these values, and never add app_config to backups.
 */
import { DEFAULT_MODEL } from '@/features/ai/gemini';
import { tasksDb } from '@/services/local-tasks';

export type ConfigKey = 'gemini_api_key' | 'gemini_model';

function bundledConfig(): Record<ConfigKey, string> {
  return {
    gemini_api_key: (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim(),
    gemini_model: (process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '').trim() || DEFAULT_MODEL,
  };
}

let synced: Promise<void> | null = null;

/** Copies the bundled settings into app_config when missing or different. Runs once per start. */
export function syncBundledConfig() {
  if (!synced) {
    synced = (async () => {
      const database = await tasksDb();
      const now = new Date().toISOString();
      for (const [key, value] of Object.entries(bundledConfig()) as [ConfigKey, string][]) {
        if (!value) continue;
        const row = await database.getFirstAsync<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', key);
        if (row?.value === value) continue;
        await database.runAsync(
          `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          key,
          value,
          now,
        );
      }
    })();
    // A failed start (e.g. database busy) is tried again on the next call.
    synced.catch(() => {
      synced = null;
    });
  }
  return synced;
}

export async function getConfig(key: ConfigKey): Promise<string | null> {
  await syncBundledConfig().catch(() => undefined);
  const row = await (await tasksDb()).getFirstAsync<{ value: string | null }>('SELECT value FROM app_config WHERE key = ?', key);
  return row?.value?.trim() || null;
}
