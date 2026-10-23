/**
 * Local ORDINA AI allowance, so one phone cannot use up the free Gemini quota: by default 10
 * requests per minute and 100 per day (the phone's calendar day). Pure; the state is stored in
 * SQLite by services/ai/geminiClient.ts.
 */

export const AI_LIMITS = { perMinute: 10, perDay: 100 };

export type UsageState = { recent: number[]; day: string; dayCount: number };

export const EMPTY_USAGE: UsageState = { recent: [], day: '', dayCount: 0 };

function dayKey(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Checks one more request. When allowed, `next` already counts it. */
export function takeRequest(state: UsageState | null | undefined, now = new Date(), limits = AI_LIMITS):
  { allowed: true; next: UsageState } | { allowed: false; reason: 'minute' | 'day'; next: UsageState } {
  const today = dayKey(now);
  const time = now.getTime();
  const current: UsageState = state && typeof state === 'object' ? state : EMPTY_USAGE;
  const recent = (Array.isArray(current.recent) ? current.recent : []).filter((at) => typeof at === 'number' && time - at < 60_000 && at <= time);
  const dayCount = current.day === today && Number.isFinite(current.dayCount) ? current.dayCount : 0;
  const unchanged: UsageState = { recent, day: today, dayCount };
  if (dayCount >= limits.perDay) return { allowed: false, reason: 'day', next: unchanged };
  if (recent.length >= limits.perMinute) return { allowed: false, reason: 'minute', next: unchanged };
  return { allowed: true, next: { recent: [...recent, time], day: today, dayCount: dayCount + 1 } };
}
