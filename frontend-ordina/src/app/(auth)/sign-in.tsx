import { Link } from 'expo-router';
import { href } from '@/utils/href';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

export default function SignInScreen() {
  const theme = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  // Without Google / Apple sign-in the email form is the only option, so show it straight away.
  const [showEmail, setShowEmail] = useState(!FEATURES.socialSignIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Sign in', 'Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      routeAfterAuth();
    } catch (error: any) {
      Alert.alert('Sign in failed', error?.response?.data?.message ?? 'Unable to reach the server. Check your network connection.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <BrandLockup markSize={108} wordmarkSize="md" />
          </View>

          <View style={styles.heading}>
            <ThemedText style={styles.title}>Put order in your day</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {FEATURES.socialSignIn
                ? 'Sign in with the account you already use. No new password needed.'
                : 'Sign in with your email to plan your day.'}
            </ThemedText>
          </View>

          {FEATURES.socialSignIn ? <SocialAuthButtons /> : null}

          {showEmail ? (
            <View style={styles.emailForm}>
              {FEATURES.socialSignIn ? <View style={styles.dividerRow}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <ThemedText themeColor="textSecondary" style={styles.or}>
                  or with email
                </ThemedText>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
              </View> : null}
              <AuthField
                label="Email Address"
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <AuthField
                label="Password"
                placeholder="••••••••"
                isPassword
                value={password}
                onChangeText={setPassword}
              />
              <Link href={href('/forgot-password')} asChild>
                <Pressable style={styles.forgot}>
                  <ThemedText style={[styles.link, { color: theme.primary }]}>Forgot Password?</ThemedText>
                </Pressable>
              </Link>
              <PrimaryButton
                label={submitting ? 'Signing in…' : 'Sign In'}
                disabled={submitting}
                onPress={() => void onSignIn()}
              />
              <View style={styles.inlineRow}>
                <ThemedText themeColor="textSecondary">New to ORDINA? </ThemedText>
                <Link href={href('/sign-up')}>
                  <ThemedText style={[styles.link, { color: theme.primary }]}>Create an account</ThemedText>
                </Link>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setShowEmail(true)} style={styles.emailToggle}>
              <ThemedText style={[styles.link, { color: theme.primary }]}>Use email instead</ThemedText>
            </Pressable>
          )}

          <ThemedText themeColor="textSecondary" style={styles.legal}>
            {FEATURES.integrations
              ? 'By continuing you agree to ORDINA’s Terms and Privacy Policy. ORDINA only reads your calendar and contacts when you connect them.'
              : 'By continuing you agree to ORDINA’s Terms and Privacy Policy.'}
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
    flexGrow: 1,
  },
  hero: { marginTop: 24 },
  heading: { gap: 6, marginTop: 8, marginBottom: 8, alignItems: 'center' },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center' },
  emailForm: { gap: 14 },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 4 },
  link: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  line: { flex: 1, height: 1 },
  or: { fontSize: 12 },
  emailToggle: { alignSelf: 'center', paddingVertical: 8 },
  inlineRow: { flexDirection: 'row', justifyContent: 'center' },
  legal: { fontSize: 11, textAlign: 'center', marginTop: 'auto', paddingTop: 16 },
});
