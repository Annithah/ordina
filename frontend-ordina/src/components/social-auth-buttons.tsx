import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { routeAfterAuth } from '@/utils/after-auth';

WebBrowser.maybeCompleteAuthSession();

// The hook needs some client id even when Google sign-in isn't set up; it is never used then.
const PLACEHOLDER_CLIENT = '000000000000-placeholder.apps.googleusercontent.com';

/** Name and email straight from Google with the user's access token (no ORDINA server involved). */
async function googleProfile(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google profile ${response.status}`);
  return (await response.json()) as { name?: string; email?: string };
}

export function SocialAuthButtons() {
  const theme = useTheme();
  const { t } = useI18n();
  const isDark = theme.background === '#000000';
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || PLACEHOLDER_CLIENT,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || PLACEHOLDER_CLIENT,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || PLACEHOLDER_CLIENT,
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      setBusy(null);
      if (response.type === 'error') toast.info(t('auth.google.failed'));
      return;
    }
    const accessToken = response.authentication?.accessToken ?? response.params.access_token;
    if (!accessToken) {
      setBusy(null);
      toast.info(t('auth.google.failed'));
      return;
    }
    void googleProfile(accessToken)
      .then((profile) => useAuthStore.getState().signInWithProvider({ provider: 'google', name: profile.name, email: profile.email }))
      .then(() => routeAfterAuth())
      .catch(() => toast.info(t('auth.google.failed')))
      .finally(() => setBusy(null));
  }, [response, t]);

  async function onGoogle() {
    if (!googleClientId || !request) {
      toast.info(t('auth.google.notReady'));
      return;
    }
    setBusy('google');
    try {
      const result = await promptAsync();
      if (result.type !== 'success') setBusy(null);
    } catch {
      setBusy(null);
      toast.info(t('auth.google.failed'));
    }
  }

  async function onApple() {
    if (!appleAvailable) {
      toast.info(t('auth.apple.iphoneOnly'));
      return;
    }
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      await useAuthStore.getState().signInWithProvider({
        provider: 'apple',
        name,
        email: credential.email,
        appleUserId: credential.user,
      });
      routeAfterAuth();
    } catch (error: any) {
      if (error?.code !== 'ERR_REQUEST_CANCELED') toast.info(t('auth.apple.failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        disabled={busy !== null}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed || busy === 'google' ? 0.8 : 1 },
        ]}
        onPress={() => void onGoogle()}>
        {busy === 'google' ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color="#EA4335" />
            <ThemedText style={styles.label}>{t('auth.continueGoogle')}</ThemedText>
          </>
        )}
      </Pressable>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={16}
          style={styles.apple}
          onPress={() => void onApple()}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => void onApple()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: isDark ? '#FFFFFF' : '#000000', borderColor: isDark ? '#FFFFFF' : '#000000', opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons name="logo-apple" size={20} color={isDark ? '#000000' : '#FFFFFF'} />
          <ThemedText style={[styles.label, { color: isDark ? '#000000' : '#FFFFFF' }]}>{t('auth.continueApple')}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  button: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
  },
  apple: { height: 54, width: '100%' },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
});
