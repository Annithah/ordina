import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { routeAfterAuth } from '@/utils/after-auth';

WebBrowser.maybeCompleteAuthSession();

export function SocialAuthButtons() {
  const theme = useTheme();
  const isDark = theme.background === '#000000';
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });
  const googleRequestClient = '000000000000-placeholder.apps.googleusercontent.com';
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || googleRequestClient,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || googleRequestClient,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || googleRequestClient,
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      setBusy(null);
      if (response.type === 'error') {
        Alert.alert('Google', response.error?.message || 'Google sign-in failed. Please try again.');
      }
      return;
    }
    const idToken = response.params.id_token || response.authentication?.idToken;
    if (!idToken) {
      setBusy(null);
      Alert.alert('Google', 'Google did not return an ID token.');
      return;
    }
    void useAuthStore
      .getState()
      .signInWithGoogle(idToken)
      .then(() => routeAfterAuth())
      .catch((error: any) => {
        Alert.alert('Google', error?.response?.data?.message || error?.message || 'Google sign-in failed.');
      })
      .finally(() => setBusy(null));
  }, [response]);

  async function onGoogle() {
    if (!googleClientId || !request) {
      Alert.alert('Coming soon', 'Continue with Google will be available very soon. For now, please continue with email.');
      return;
    }
    setBusy('google');
    try {
      const result = await promptAsync();
      if (result.type !== 'success') setBusy(null);
    } catch {
      setBusy(null);
    }
  }

  async function onApple() {
    if (!appleAvailable) {
      Alert.alert('Coming soon', 'Continue with Apple will be available very soon. For now, please continue with email.');
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
      if (!credential.identityToken) {
        Alert.alert('Apple', 'Apple did not return an identity token.');
        return;
      }
      await useAuthStore.getState().signInWithApple({
        identityToken: credential.identityToken,
        fullName: credential.fullName,
      });
      routeAfterAuth();
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple', error?.response?.data?.message || error?.message || 'Apple sign-in failed.');
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
            <ThemedText style={styles.label}>Continue with Google</ThemedText>
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
          <ThemedText style={[styles.label, { color: isDark ? '#000000' : '#FFFFFF' }]}>Continue with Apple</ThemedText>
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
