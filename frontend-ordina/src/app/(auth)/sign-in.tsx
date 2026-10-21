import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth-field';
import { BrandLockup } from '@/components/brand-lockup';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LanguageButton } from '@/components/language-picker';
import { PrimaryButton } from '@/components/primary-button';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { deleteAllLocalData } from '@/services/local-tasks';
import { AuthError, EMAIL_RE, PASSKEY_RE, useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';
import { routeAfterAuth } from '@/utils/after-auth';
import { href } from '@/utils/href';

function formatWait(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function SignInScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [passkey, setPasskey] = useState('');
  const [errors, setErrors] = useState<{ email?: string; passkey?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState<null | 'google' | 'local'>(null);
  const [resetting, setResetting] = useState(false);

  async function onSignIn() {
    const found: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) found.email = t('auth.errors.email');
    if (!PASSKEY_RE.test(passkey)) found.passkey = t('auth.errors.passkey');
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await signIn({ email, passkey });
      routeAfterAuth();
    } catch (error) {
      setPasskey('');
      const code = error instanceof AuthError ? error.code : 'wrong';
      setFormError(t(`auth.errors.${code}`, { time: formatWait(useLockStore.getState().remainingMs()) }));
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot() {
    // Google users prove who they are with Google and choose a new passkey; email accounts can only reset.
    const provider = EMAIL_RE.test(email.trim()) ? await useAuthStore.getState().providerFor(email) : null;
    setForgot(provider === 'google' || provider === 'apple' ? 'google' : 'local');
  }

  async function resetPhone() {
    setResetting(true);
    try {
      await deleteAllLocalData();
      await useAuthStore.getState().resetAccounts();
      setForgot(null);
      toast.success(t('auth.resetDone'));
      router.replace(href('/sign-up'));
    } finally {
      setResetting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <KeyboardAwareScrollView
          bottomOffset={32}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.languageRow}>
            <LanguageButton />
          </View>
          <View style={styles.hero}>
            <BrandLockup markSize={96} wordmarkSize="md" />
          </View>

          <View style={styles.heading}>
            <ThemedText style={styles.title}>{t('auth.signInTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {t('auth.signInSubtitle')}
            </ThemedText>
          </View>

          <SocialAuthButtons />

          <View style={styles.dividerRow}>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
            <ThemedText themeColor="textSecondary" style={styles.or}>{t('auth.orEmail')}</ThemedText>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
          </View>

          <AuthField
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            error={errors.email}
            onChangeText={(value) => {
              setEmail(value);
              setErrors(({ email: _cleared, ...rest }) => rest);
            }}
          />
          <AuthField
            label={t('auth.passkey')}
            placeholder="••••"
            isPassword
            keyboardType="number-pad"
            maxLength={4}
            value={passkey}
            error={errors.passkey}
            onChangeText={(value) => {
              setPasskey(value.replace(/\D/g, '').slice(0, 4));
              setErrors(({ passkey: _cleared, ...rest }) => rest);
            }}
            onSubmitEditing={() => void onSignIn()}
          />
          <Pressable onPress={() => void onForgot()} style={styles.forgot} hitSlop={6}>
            <ThemedText style={[styles.link, { color: theme.primary }]}>{t('auth.forgot')}</ThemedText>
          </Pressable>

          {formError ? (
            <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.noticeText}>{formError}</ThemedText>
            </View>
          ) : null}

          <PrimaryButton
            label={submitting ? t('auth.signingIn') : t('auth.signIn')}
            disabled={submitting}
            onPress={() => void onSignIn()}
          />
          <View style={styles.inlineRow}>
            <ThemedText themeColor="textSecondary">{t('auth.noAccount')} </ThemedText>
            <Pressable onPress={() => router.replace(href('/sign-up'))} hitSlop={6}>
              <ThemedText style={[styles.link, { color: theme.primary }]}>{t('auth.createLink')}</ThemedText>
            </Pressable>
          </View>

          <ThemedText themeColor="textSecondary" style={styles.legal}>
            {t('auth.legal')}
            {`
ORDINA v${Constants.expoConfig?.version}`}
          </ThemedText>
        </KeyboardAwareScrollView>

      <ConfirmDialog
        visible={forgot === 'local'}
        title={t('auth.forgotTitle')}
        message={t('auth.forgotLocal')}
        confirmLabel={t('auth.resetConfirm')}
        destructive
        busy={resetting}
        onConfirm={() => void resetPhone()}
        onCancel={() => setForgot(null)}
      />
      <ConfirmDialog
        visible={forgot === 'google'}
        title={t('auth.forgotTitle')}
        message={t('auth.forgotGoogle')}
        confirmLabel={t('common.done')}
        onConfirm={() => setForgot(null)}
        onCancel={() => setForgot(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28, gap: 14, flexGrow: 1 },
  languageRow: { alignItems: 'flex-end' },
  hero: { marginTop: 4 },
  heading: { gap: 6, marginTop: 4, marginBottom: 4, alignItems: 'center' },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center' },
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  link: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  line: { flex: 1, height: 1 },
  or: { fontSize: 12 },
  notice: { borderRadius: 12, padding: 12 },
  noticeText: { fontSize: 13, textAlign: 'center' },
  inlineRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  legal: { fontSize: 11, textAlign: 'center', marginTop: 'auto', paddingTop: 16 },
});
