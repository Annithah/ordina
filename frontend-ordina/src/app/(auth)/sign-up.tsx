import { Link } from 'expo-router';
import { href } from '@/utils/href';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth-field';
import { BrandLockup } from '@/components/brand-lockup';
import { PrimaryButton } from '@/components/primary-button';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { routeAfterAuth } from '@/utils/after-auth';
import { FEATURES } from '@/config/release';

export default function SignUpScreen() {
  const theme = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function onCreate() {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Create Account', 'Fill in name, email, and password.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Create Account', 'Passwords do not match.');
      return;
    }

    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      routeAfterAuth();
    } catch (error: any) {
      Alert.alert('Create account failed', error?.response?.data?.message ?? 'Unable to connect to the server. Check your network connection.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BrandLockup markSize={88} wordmarkSize="sm" />

          <View style={styles.heading}>
            <ThemedText style={styles.title}>Create Account</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Start organizing your day
            </ThemedText>
          </View>

          <AuthField label="Full Name" placeholder="Sarah Jones" value={name} onChangeText={setName} />
          <AuthField
            label="Email Address"
            placeholder="sarah.jones@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <AuthField label="Password" placeholder="••••••••" isPassword value={password} onChangeText={setPassword} />
          <AuthField
            label="Confirm Password"
            placeholder="••••••••"
            isPassword
            value={confirm}
            onChangeText={setConfirm}
          />

          <PrimaryButton label="Create Account" onPress={() => void onCreate()} />

          {FEATURES.socialSignIn ? (
            <>
              <View style={styles.dividerRow}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <ThemedText themeColor="textSecondary" style={styles.or}>
                  or sign up with
                </ThemedText>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
              </View>
              <SocialAuthButtons />
            </>
          ) : null}

          <View style={styles.footer}>
            <ThemedText themeColor="textSecondary">Already have an account? </ThemedText>
            <Link href={href('/sign-in')}>
              <ThemedText style={[styles.link, { color: theme.primary }]}>Sign In</ThemedText>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 12,
    flexGrow: 1,
  },
  heading: { gap: 4, marginTop: 8, marginBottom: 2 },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
  subtitle: { fontSize: 14 },
  link: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  line: { flex: 1, height: 1 },
  or: { fontSize: 12 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: 16,
  },
});
