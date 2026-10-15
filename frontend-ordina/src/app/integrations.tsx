import Ionicons from '@expo/vector-icons/Ionicons';
import * as Google from 'expo-auth-session/providers/google';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnection,
  googleCalendarScope,
  saveGoogleCalendarConnection,
} from '@/services/google-calendar';
import { getNotificationPermission, ensureNotificationPermission } from '@/services/notifications';
import { useAuthStore } from '@/store/auth-store';

type Row = { id: string; label: string; why: string; state: string; request: () => Promise<void> };
const GOOGLE_CLIENT_PLACEHOLDER = '000000000000-placeholder.apps.googleusercontent.com';

export default function IntegrationsScreen() {
  const theme = useTheme();
  const ordinaUserId = useAuthStore((state) => state.user?.id);
  const [states, setStates] = useState<Record<string, string>>({});
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [calendarNeedsReconnect, setCalendarNeedsReconnect] = useState(false);
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const calendarClientId = Platform.select({
    ios: googleIosClientId,
    android: googleAndroidClientId,
    default: googleClientId,
  });
  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    webClientId: googleClientId || GOOGLE_CLIENT_PLACEHOLDER,
    iosClientId: googleIosClientId || GOOGLE_CLIENT_PLACEHOLDER,
    androidClientId: googleAndroidClientId || GOOGLE_CLIENT_PLACEHOLDER,
    scopes: [googleCalendarScope],
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const refresh = useCallback(async () => {
    try {
      const [contacts, location, photos, notifications] = await Promise.all([
        Contacts.getPermissionsAsync(),
        Location.getForegroundPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
        getNotificationPermission(),
      ]);
      setStates({
        contacts: contacts.status,
        location: location.status,
        photos: photos.status,
        notifications,
        microphone: 'Ask when you use voice',
      });
      const connection = await getGoogleCalendarConnection(ordinaUserId);
      setCalendarEmail(connection?.email ?? null);
      setCalendarNeedsReconnect(Boolean(connection?.needsReconnect));
    } catch (error) {
      console.error('Unable to refresh integration permissions:', error);
      Alert.alert('Integrations', error instanceof Error ? error.message : 'Could not refresh integrations.');
    }
  }, [ordinaUserId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'error') {
      Alert.alert('Google Calendar', googleResponse.error?.message || 'Google Calendar connection failed.');
      return;
    }
    if (googleResponse.type !== 'success') return;
    const accessToken = googleResponse.authentication?.accessToken || googleResponse.params.access_token;
    if (!accessToken) {
      Alert.alert('Google Calendar', 'Google did not return Calendar access. Check the OAuth client configuration.');
      return;
    }
    if (!ordinaUserId || !calendarClientId) {
      Alert.alert('Google Calendar', 'Sign in to ORDINA and configure its Google OAuth client before connecting Calendar.');
      return;
    }
    void saveGoogleCalendarConnection(
      accessToken,
      googleResponse.authentication?.expiresIn || Number(googleResponse.params.expires_in),
      googleResponse.authentication?.refreshToken,
      calendarClientId,
      ordinaUserId,
    )
      .then((email) => {
        setCalendarEmail(email);
        Alert.alert('Google Calendar', `Connected ${email}. Confirmed ORDINA plans can now be added to your primary calendar.`);
      })
      .catch((error: unknown) => {
        Alert.alert('Google Calendar', error instanceof Error ? error.message : 'Could not save the Calendar connection.');
      });
  }, [googleResponse, calendarClientId, ordinaUserId]);

  async function connectGoogleCalendar() {
    if (!calendarClientId) {
      Alert.alert(
        'Google Calendar',
        'Google OAuth is not configured. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID and the platform-specific Google client IDs in frontend-ordina/.env.',
      );
      return;
    }
    await promptGoogle();
  }

  async function disconnectCalendar() {
    await disconnectGoogleCalendar();
    setCalendarEmail(null);
    setCalendarNeedsReconnect(false);
  }

  async function savePlace(name: string) {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location', 'Allow location so ORDINA can save this place.');
        await refresh();
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/api/places', {
        name,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusMeters: 150,
      });
      Alert.alert('Place saved', `${name} is saved. Ask ORDINA: “Remind me when I arrive at ${name.toLowerCase()}”.`);
    } catch (error: any) {
      Alert.alert('Place', error?.response?.data?.message || 'Could not save that place. Sign in and try again.');
    }
  }

  async function requestIntegration(row: Row) {
    try {
      await row.request();
    } catch (error) {
      console.error(`Unable to request ${row.label} integration:`, error);
      Alert.alert(row.label, error instanceof Error ? error.message : `Could not update ${row.label} permission.`);
    }
  }

  const rows: Row[] = [
    {
      id: 'contacts',
      label: 'Contacts',
      why: 'Used only to match a name such as “Call John”, not to upload your whole address book.',
      state: states.contacts || 'undetermined',
      request: async () => {
        const result = await Contacts.requestPermissionsAsync();
        if (!result.granted) Alert.alert('Contacts', 'Permission denied. ORDINA will skip contact matching.');
        await refresh();
      },
    },
    {
      id: 'microphone',
      label: 'Microphone',
      why: 'Required to speak to ORDINA. Audio is sent to the backend for transcription, not stored in the app.',
      state: states.microphone || 'undetermined',
      request: async () => {
        const { requestRecordingPermissionsAsync } = await import('expo-audio');
        const permission = await requestRecordingPermissionsAsync();
        setStates((current) => ({ ...current, microphone: permission.status }));
        if (!permission.granted) {
          Alert.alert('Microphone', 'Permission denied. You can still type instructions to ORDINA.');
        }
      },
    },
    {
      id: 'notifications',
      label: 'Notifications',
      why: 'Task reminders, deadlines and schedule alerts.',
      state: states.notifications || 'undetermined',
      request: async () => {
        await ensureNotificationPermission();
        await refresh();
      },
    },
    {
      id: 'location',
      label: 'Location',
      why: 'Only while the app is open: arrival reminders like “when I arrive at work”. Background geofences need a native build.',
      state: states.location || 'undetermined',
      request: async () => {
        await Location.requestForegroundPermissionsAsync();
        await refresh();
      },
    },
    {
      id: 'photos',
      label: 'Photos / files',
      why: 'Choose a photo of a list or whiteboard so ORDINA can propose tasks. Confirm before anything is saved.',
      state: states.photos || 'undetermined',
      request: async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setStates((current) => ({ ...current, photos: permission.status }));
        if (!permission.granted) {
          Alert.alert('Photos / files', 'Permission denied. You can still type tasks to ORDINA.');
        }
        await refresh();
      },
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>Integrations</ThemedText>
      </View>
      <ThemedText themeColor="textSecondary" style={styles.lead}>
        Every integration is optional. ORDINA never bypasses the system permission prompt.
      </ThemedText>
      <ScrollView contentContainerStyle={styles.list}>
        <Pressable
          disabled={!googleRequest}
          onPress={() => void (calendarEmail && !calendarNeedsReconnect ? disconnectCalendar() : connectGoogleCalendar())}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Google Calendar</ThemedText>
            <ThemedText themeColor="textSecondary">
              {!calendarClientId
                ? `Not configured for ${Platform.OS}. Set the matching EXPO_PUBLIC_GOOGLE_${Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : ''}CLIENT_ID in frontend-ordina/.env.`
                : calendarEmail
                ? calendarNeedsReconnect
                  ? `Session expired for ${calendarEmail}. Reconnect to continue using Google Calendar.`
                  : `Connected as ${calendarEmail}. Confirmed plans are added to your primary calendar.`
                : 'Connect Google to check schedule conflicts and add confirmed plans.'}
            </ThemedText>
          </View>
          <ThemedText style={{ color: theme.primary }}>
            {!calendarClientId ? 'Setup required' : calendarEmail && !calendarNeedsReconnect ? 'Disconnect' : calendarEmail ? 'Reconnect' : 'Connect'}
          </ThemedText>
        </Pressable>
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => void requestIntegration(row)}
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>{row.label}</ThemedText>
              <ThemedText themeColor="textSecondary">{row.why}</ThemedText>
            </View>
            <ThemedText style={{ color: theme.primary, textTransform: 'capitalize' }}>{row.state}</ThemedText>
          </Pressable>
        ))}
        <Pressable
          onPress={() => void savePlace('Home')}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Save current location as Home</ThemedText>
            <ThemedText themeColor="textSecondary">Used for “remind me when I arrive at home”.</ThemedText>
          </View>
        </Pressable>
        <Pressable
          onPress={() => void savePlace('Work')}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Save current location as Work</ThemedText>
            <ThemedText themeColor="textSecondary">Used for “remind me when I arrive at work”.</ThemedText>
          </View>
        </Pressable>
        <Pressable onPress={() => void Linking.openSettings()}>
          <ThemedText style={{ color: theme.primary, textAlign: 'center' }}>Open system settings</ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  lead: { marginBottom: 16, lineHeight: 20 },
  list: { gap: 12, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  label: { fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
});
