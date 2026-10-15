import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'ordina.googleCalendarToken.v1';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export type GoogleCalendarToken = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  expiresAt: number;
  email: string;
  ordinaUserId: number;
};

export type CalendarBusyEvent = {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
};

function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeToken(value: string | null) {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    if (value == null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, value);
    return;
  }
  if (value == null) await SecureStore.deleteItemAsync(TOKEN_KEY);
  else await SecureStore.setItemAsync(TOKEN_KEY, value);
}

export async function getGoogleCalendarConnection(ordinaUserId?: number) {
  const stored = await readToken();
  if (!stored) return null;
  const token = JSON.parse(stored) as GoogleCalendarToken;
  if (!token.accessToken || !token.email || !Number.isFinite(token.expiresAt) || !Number.isFinite(token.ordinaUserId)) {
    await writeToken(null);
    throw new Error('Saved Google Calendar connection is invalid. Connect Google Calendar again.');
  }
  if (!ordinaUserId || token.ordinaUserId !== ordinaUserId) {
    await writeToken(null);
    return null;
  }
  return {
    email: token.email,
    expiresAt: token.expiresAt,
    needsReconnect: token.expiresAt <= Date.now() && !token.refreshToken,
  };
}

export async function saveGoogleCalendarConnection(
  accessToken: string,
  expiresIn: number | undefined,
  refreshToken: string | undefined,
  clientId: string,
  ordinaUserId: number,
) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Google could not verify the selected Calendar account.');
  const user = (await response.json()) as { email?: string; email_verified?: boolean };
  if (!user.email || user.email_verified === false) {
    throw new Error('Google did not provide a verified email for this Calendar account.');
  }
  const previous = await readToken();
  const previousToken = previous ? (JSON.parse(previous) as GoogleCalendarToken) : null;
  const previousTokenForAccount = previousToken
    && previousToken.ordinaUserId === ordinaUserId
    && previousToken.email.toLowerCase() === user.email.toLowerCase()
    ? previousToken
    : null;
  const reusableRefreshToken = previousTokenForAccount?.refreshToken;
  const effectiveClientId = refreshToken
    ? clientId
    : reusableRefreshToken
      ? previousTokenForAccount?.clientId || clientId
      : clientId;
  const token: GoogleCalendarToken = {
    accessToken,
    refreshToken: refreshToken || reusableRefreshToken,
    clientId: effectiveClientId,
    expiresAt: Date.now() + (expiresIn ?? 3600) * 1000,
    email: user.email,
    ordinaUserId,
  };
  await writeToken(JSON.stringify(token));
  return token.email;
}

async function getAccessToken(ordinaUserId: number): Promise<string | null> {
  const stored = await readToken();
  if (!stored) return null;
  let token = JSON.parse(stored) as GoogleCalendarToken;
  if (token.ordinaUserId !== ordinaUserId) {
    await writeToken(null);
    return null;
  }
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) {
    throw new Error('Google Calendar access expired. Reconnect Google Calendar in Integrations.');
  }
  const clientId = token.clientId
    || (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
        : undefined)
    || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google Calendar is not configured. Add a Google OAuth client ID.');
  const refreshed = await AuthSession.refreshAsync(
    { clientId, refreshToken: token.refreshToken },
    Google.discovery,
  );
  token = {
    ...token,
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 3600) * 1000,
    refreshToken: refreshed.refreshToken || token.refreshToken,
  };
  await writeToken(JSON.stringify(token));
  return token.accessToken;
}

async function calendarRequest(path: string, ordinaUserId: number, init: RequestInit = {}) {
  const accessToken = await getAccessToken(ordinaUserId);
  if (!accessToken) return null;
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (response.status === 401) {
      await writeToken(null);
      throw new Error('Google Calendar access was revoked. Connect Google Calendar again.');
    }
    throw new Error(details?.error?.message || `Google Calendar request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

export async function getGoogleCalendarBusyEvents(ordinaUserId: number): Promise<CalendarBusyEvent[]> {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const result = await calendarRequest(`calendars/primary/events?${params.toString()}`, ordinaUserId) as
    | { items?: { summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] }
    | null;
  return (result?.items || []).flatMap((event) => {
    if (!event.start?.dateTime || !event.end?.dateTime) return [];
    const startDate = new Date(event.start.dateTime);
    const endDate = new Date(event.end.dateTime);
    return [{
      title: event.summary || 'Google Calendar event',
      date: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
      startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      durationMinutes: Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60_000)),
    }];
  });
}

export async function createGoogleCalendarEvents(
  events: {
    title: string;
    description?: string;
    date?: string;
    startTime?: string;
    durationMinutes?: number;
    contactName?: string;
    contactPhone?: string;
  }[],
  ordinaUserId: number,
) {
  const token = await readToken();
  if (!token) return { created: 0, skipped: true };
  let created = 0;
  for (const event of events) {
    if (!event.date) continue;
    const start = new Date(`${event.date}T${event.startTime || '09:00'}:00`);
    if (Number.isNaN(start.getTime())) throw new Error(`Invalid calendar event date for “${event.title}”.`);
    const end = new Date(start.getTime() + (event.durationMinutes || 60) * 60_000);
    await calendarRequest('calendars/primary/events', ordinaUserId, {
      method: 'POST',
      body: JSON.stringify({
        summary: event.title,
        description: [
          event.description,
          event.contactName ? `Contact: ${event.contactName}${event.contactPhone ? ` (${event.contactPhone})` : ''}` : '',
          'Planned with ORDINA',
        ].filter(Boolean).join('\n'),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
    created += 1;
  }
  return { created, skipped: false };
}

export async function disconnectGoogleCalendar() {
  await writeToken(null);
}

export const googleCalendarScope = CALENDAR_SCOPE;
