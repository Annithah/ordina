/**
 * Account panel on the Profile tab (signed out): create account / log in, forgot password
 * (6-digit code sent by email, never shown in the app), Google and Apple as "Coming soon",
 * and "Continue without an account". Accounts are optional; they add server backup and sync.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AuthField } from '@/components/auth-field';
import { OrdinaMark } from '@/components/ordina-mark';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { API_BASE_URL } from '@/services/api';
import { useAuthStore } from '@/store/auth-store';
import { friendlyError } from '@/utils/task-validation';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const GOOGLE_SIGNUP_URL = 'https://accounts.google.com/signup';

type Mode = 'create' | 'login' | 'forgot' | 'reset';
type Fields = { name: string; email: string; password: string; confirm: string; code: string };
type Errors = Partial<Record<keyof Fields | 'form', string>>;

/** Field checks with error keys (translated by the caller). Exported for tests and reuse. */
export function validateAccountForm(mode: Mode, fields: Fields): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {};
  if (mode === 'create' && !fields.name.trim()) errors.name = 'account.nameRequired';
  if (!fields.email.trim()) errors.email = 'account.emailRequired';
  else if (!EMAIL_RE.test(fields.email.trim())) errors.email = 'account.emailInvalid';
  if (mode === 'login' && !fields.password) errors.password = 'account.passwordRequired';
  if (mode === 'create' || mode === 'reset') {
    if (!fields.password) errors.password = 'account.passwordRequired';
    else if (fields.password.length < PASSWORD_MIN) errors.password = 'account.passwordShort';
    if (!fields.confirm) errors.confirm = 'account.confirmRequired';
    else if (fields.confirm !== fields.password) errors.confirm = 'account.mismatch';
  }
  if (mode === 'reset' && !/^\d{6}$/.test(fields.code.trim())) errors.code = 'account.codeInvalid';
  return errors;
}

/** Google's multi-colour "G" (official brand asset geometry). */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function ProviderButton({ label, onPress, background, border, color, icon, badge }: {
  label: string; onPress: () => void; background: string; border: string; color: string; icon: ReactNode; badge: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${badge}`}
      onPress={onPress}
      style={({ pressed }) => [styles.provider, { backgroundColor: background, borderColor: border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.providerIcon}>{icon}</View>
      <ThemedText style={[styles.providerText, { color }]} numberOfLines={1}>{label}</ThemedText>
      <ThemedText style={[styles.badge, { color, borderColor: border }]}>{badge}</ThemedText>
    </Pressable>
  );
}

export function AccountPanel({ onSkip }: { onSkip: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const { scheme } = useAppTheme();
  const dark = scheme === 'dark';
  const { signIn, signUp, requestPasswordReset, resetPassword } = useAuthStore();
  const [mode, setMode] = useState<Mode>('create');
  const [fields, setFields] = useState<Fields>({ name: '', email: '', password: '', confirm: '', code: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const serverReady = Boolean(API_BASE_URL);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (errors[key] || errors.form) setErrors(({ [key]: _cleared, form: _form, ...rest }) => rest);
  };

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setNotice(null);
    setFields((current) => ({ ...current, password: '', confirm: '', code: '' }));
  }

  async function submit() {
    if (busy) return;
    const found = validateAccountForm(mode, fields);
    const translated: Errors = Object.fromEntries(Object.entries(found).map(([key, value]) => [key, t(value as string)]));
    setErrors(translated);
    if (Object.keys(found).length) return;
    if (!serverReady) {
      setErrors({ form: t('account.serverNotConnected') });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'create') {
        await signUp({ name: fields.name, email: fields.email, password: fields.password });
        toast.success(t('account.created'));
      } else if (mode === 'login') {
        await signIn({ email: fields.email, password: fields.password });
        toast.success(t('account.welcomeBack'));
      } else if (mode === 'forgot') {
        await requestPasswordReset(fields.email);
        setMode('reset');
        setNotice(t('account.codeSent', { email: fields.email.trim() }));
      } else {
        await resetPassword({ email: fields.email, code: fields.code, password: fields.password });
        switchMode('login');
        setNotice(t('account.resetDone'));
      }
    } catch (error) {
      const err = error as { response?: unknown };
      setErrors({ form: err && !err.response ? t('account.serverNotConnected') : friendlyError(error, t('errors.generic')) });
    } finally {
      setBusy(false);
    }
  }

  const soon = (provider: string) => toast.info(t('account.providerSoon', { provider }));
  const submitLabel = mode === 'create' ? t('account.create') : mode === 'login' ? t('account.login') : mode === 'forgot' ? t('account.sendCode') : t('account.resetButton');

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.brand}>
        <OrdinaMark size={56} color={theme.primary} />
        <ThemedText themeColor="textSecondary" style={styles.headline}>{t('account.headline')}</ThemedText>
      </View>

      {mode === 'create' || mode === 'login' ? (
        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
          {(['create', 'login'] as const).map((id) => {
            const active = mode === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => switchMode(id)}
                style={[styles.tab, active && { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText style={[styles.tabText, { color: active ? theme.primary : theme.textSecondary }]}>{id === 'create' ? t('account.create') : t('account.login')}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <ThemedText style={styles.formTitle} accessibilityRole="header">{t('account.forgotTitle')}</ThemedText>
          {mode === 'forgot' ? <ThemedText themeColor="textSecondary" style={styles.small}>{t('account.forgotBody')}</ThemedText> : null}
        </View>
      )}

      {notice ? (
        <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="mail-outline" size={16} color={theme.primary} />
          <ThemedText style={[styles.small, { flex: 1, color: theme.primary }]}>{notice}</ThemedText>
        </View>
      ) : null}

      <View style={styles.form}>
        {mode === 'create' ? (
          <AuthField label={t('account.fullName')} value={fields.name} onChangeText={set('name')} placeholder={t('account.namePlaceholder')} autoComplete="name" textContentType="name" autoCapitalize="words" error={errors.name} />
        ) : null}
        <AuthField
          label={t('account.email')}
          value={fields.email}
          onChangeText={set('email')}
          placeholder={t('account.emailPlaceholder')}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={mode !== 'reset'}
          error={errors.email}
        />
        {mode === 'reset' ? (
          <AuthField label={t('account.code')} value={fields.code} onChangeText={set('code')} placeholder={t('account.codePlaceholder')} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" error={errors.code} />
        ) : null}
        {mode !== 'forgot' ? (
          <AuthField
            label={mode === 'reset' ? t('account.newPassword') : t('account.password')}
            value={fields.password}
            onChangeText={set('password')}
            placeholder={mode === 'login' ? t('account.passwordPlaceholder') : t('account.newPasswordPlaceholder')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            autoCapitalize="none"
            isPassword
            error={errors.password}
          />
        ) : null}
        {mode === 'create' || mode === 'reset' ? (
          <AuthField label={t('account.confirm')} value={fields.confirm} onChangeText={set('confirm')} placeholder={t('account.confirmPlaceholder')} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" isPassword error={errors.confirm} />
        ) : null}
        {mode === 'login' ? (
          <Pressable accessibilityRole="link" onPress={() => switchMode('forgot')} hitSlop={8} style={styles.forgot}>
            <ThemedText style={[styles.link, { color: theme.primary }]}>{t('account.forgot')}</ThemedText>
          </Pressable>
        ) : null}
        {errors.form ? <ThemedText accessibilityRole="alert" style={[styles.small, { color: theme.danger }]}>{errors.form}</ThemedText> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, { backgroundColor: theme.primary, opacity: busy ? 0.7 : pressed ? 0.85 : 1 }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.submitText}>{submitLabel}</ThemedText>}
        </Pressable>
        {mode === 'forgot' || mode === 'reset' ? (
          <Pressable accessibilityRole="button" onPress={() => switchMode('login')} hitSlop={8} style={styles.forgotCenter}>
            <ThemedText style={[styles.link, { color: theme.primary }]}>{t('account.backToLogin')}</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {mode === 'create' || mode === 'login' ? (
        <>
          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
            <ThemedText themeColor="textSecondary" style={styles.dividerText}>{t('account.or')}</ThemedText>
            <View style={[styles.line, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.providers}>
            {/* Google sign-in branding: light #FFFFFF / #747775 / #1F1F1F, dark #131314 / #8E918F / #E3E3E3. */}
            <ProviderButton
              label={t('account.google')}
              badge={t('common.comingSoon')}
              onPress={() => soon('Google')}
              background={dark ? '#131314' : '#FFFFFF'}
              border={dark ? '#8E918F' : '#747775'}
              color={dark ? '#E3E3E3' : '#1F1F1F'}
              icon={<GoogleG />}
            />
            {/* Sign in with Apple: black button on light backgrounds, white on dark. */}
            <ProviderButton
              label={t('account.apple')}
              badge={t('common.comingSoon')}
              onPress={() => soon('Apple')}
              background={dark ? '#FFFFFF' : '#000000'}
              border={dark ? '#FFFFFF' : '#000000'}
              color={dark ? '#000000' : '#FFFFFF'}
              icon={<Ionicons name="logo-apple" size={20} color={dark ? '#000000' : '#FFFFFF'} />}
            />
          </View>
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(GOOGLE_SIGNUP_URL).catch(() => undefined)} hitSlop={6} style={styles.forgotCenter}>
            <ThemedText style={[styles.link, { color: theme.primary, textAlign: 'center' }]}>{t('account.noEmail')}</ThemedText>
          </Pressable>
        </>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8} style={styles.skip}>
        <ThemedText themeColor="textSecondary" style={styles.skipText}>{t('account.skip')}</ThemedText>
      </Pressable>
    </View>
  );
}

/** Small card shown after "Continue without an account", to open the account panel again. */
export function AccountPrompt({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <OrdinaMark size={36} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.promptTitle}>{t('account.usingWithout')}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.promptSub}>{t('account.usingWithoutHint')}</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 18 },
  brand: { alignItems: 'center', gap: 8 },
  headline: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  tabs: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  tabText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  formTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  small: { fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 10 },
  form: { gap: 14 },
  forgot: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  forgotCenter: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  link: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  submit: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12 },
  providers: { gap: 10 },
  provider: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14, gap: 8 },
  providerIcon: { width: 24, alignItems: 'center' },
  providerText: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Poppins_500Medium' },
  badge: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { fontSize: 13, textDecorationLine: 'underline' },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  promptTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  promptSub: { fontSize: 12, lineHeight: 17 },
});
