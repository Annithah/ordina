import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth-field';
import { BrandLockup } from '@/components/brand-lockup';
import { PrimaryButton } from '@/components/primary-button';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { AuthError, EMAIL_RE, PASSKEY_RE, useAuthStore } from '@/store/auth-store';
import { routeAfterAuth } from '@/utils/after-auth';
import { href } from '@/utils/href';

type Fields = { name: string; email: string; passkey: string; confirm: string };

export default function SignUpScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const signUp = useAuthStore((s) => s.signUp);
  const [fields, setFields] = useState<Fields>({ name: '', email: '', passkey: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof Fields, digits = false) => (value: string) => {
    setFields((current) => ({ ...current, [key]: digits ? value.replace(/\D/g, '').slice(0, 4) : value }));
    setErrors(({ [key]: _cleared, ...rest }) => rest);
  };

  async function onCreate() {
    const found: typeof errors = {};
    if (!fields.name.trim()) found.name = t('auth.errors.name');
    if (!EMAIL_RE.test(fields.email.trim())) found.email = t('auth.errors.email');
    if (!PASSKEY_RE.test(fields.passkey)) found.passkey = t('auth.errors.passkey');
    else if (fields.confirm !== fields.passkey) found.confirm = t('auth.errors.confirm');
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await signUp({ name: fields.name, email: fields.email, passkey: fields.passkey });
      routeAfterAuth();
    } catch (error) {
      setFormError(t(`auth.errors.${error instanceof AuthError ? error.code : 'exists'}`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <KeyboardAwareScrollView
          bottomOffset={32}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BrandLockup markSize={80} wordmarkSize="sm" />

          <View style={styles.heading}>
            <ThemedText style={styles.title}>{t('auth.signUpTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>{t('auth.signUpSubtitle')}</ThemedText>
          </View>

          <SocialAuthButtons />

          <View style={styles.dividerRow}>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
            <ThemedText themeColor="textSecondary" style={styles.or}>{t('auth.orEmail')}</ThemedText>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
          </View>

          <AuthField
            label={t('auth.name')}
            placeholder={t('auth.namePlaceholder')}
            autoComplete="name"
            value={fields.name}
            error={errors.name}
            onChangeText={set('name')}
          />
          <AuthField
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={fields.email}
            error={errors.email}
            onChangeText={set('email')}
          />
          <AuthField
            label={t('auth.passkey')}
            placeholder="••••"
            isPassword
            keyboardType="number-pad"
            maxLength={4}
            value={fields.passkey}
            error={errors.passkey}
            onChangeText={set('passkey', true)}
          />
          <AuthField
            label={t('auth.confirmPasskey')}
            placeholder="••••"
            isPassword
            keyboardType="number-pad"
            maxLength={4}
            value={fields.confirm}
            error={errors.confirm}
            onChangeText={set('confirm', true)}
            onSubmitEditing={() => void onCreate()}
          />
          <ThemedText themeColor="textSecondary" style={styles.hint}>{t('auth.passkeyHint')}</ThemedText>

          {formError ? (
            <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.noticeText}>{formError}</ThemedText>
            </View>
          ) : null}

          <PrimaryButton
            label={submitting ? t('auth.creating') : t('auth.createAccount')}
            disabled={submitting}
            onPress={() => void onCreate()}
          />

          <View style={styles.footer}>
            <ThemedText themeColor="textSecondary">{t('auth.haveAccount')} </ThemedText>
            <Pressable onPress={() => router.replace(href('/sign-in'))} hitSlop={6}>
              <ThemedText style={[styles.link, { color: theme.primary }]}>{t('auth.signInLink')}</ThemedText>
            </Pressable>
          </View>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 28, gap: 12, flexGrow: 1 },
  heading: { gap: 4, marginTop: 8, marginBottom: 2 },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold' },
  subtitle: { fontSize: 14 },
  hint: { fontSize: 12, marginTop: -4 },
  link: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  line: { flex: 1, height: 1 },
  or: { fontSize: 12 },
  notice: { borderRadius: 12, padding: 12 },
  noticeText: { fontSize: 13, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'auto', paddingTop: 16 },
});
