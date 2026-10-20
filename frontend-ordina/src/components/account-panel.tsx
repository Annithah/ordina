/**
 * Account screen on the Profile tab: create account / log in, plus Google, Apple and email.
 * Design only for now: forms are validated, but nothing is saved or sent. Every sign-in
 * action shows "Coming soon" until accounts are connected.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AuthField } from '@/components/auth-field';
import { OrdinaMark } from '@/components/ordina-mark';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useAppTheme } from '@/providers/theme-provider';

const COMING_SOON = 'Coming soon — sign-in will be available in the next update.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;

type Mode = 'create' | 'login';
type Fields = { name: string; email: string; password: string; confirm: string };
type Errors = Partial<Record<keyof Fields, string>>;

export function validateAccountForm(mode: Mode, fields: Fields): Errors {
  const errors: Errors = {};
  if (mode === 'create' && !fields.name.trim()) errors.name = 'Please enter your full name.';
  if (!fields.email.trim()) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(fields.email.trim())) errors.email = 'Please enter a valid email address.';
  if (!fields.password) errors.password = 'Please enter a password.';
  else if (mode === 'create' && fields.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (mode === 'create') {
    if (!fields.confirm) errors.confirm = 'Please confirm your password.';
    else if (fields.confirm !== fields.password) errors.confirm = 'Passwords do not match.';
  }
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

function ProviderButton({ label, onPress, background, border, color, icon }: {
  label: string; onPress: () => void; background: string; border: string; color: string; icon: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.provider, { backgroundColor: background, borderColor: border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.providerIcon}>{icon}</View>
      <ThemedText style={[styles.providerText, { color }]} numberOfLines={1}>{label}</ThemedText>
      <View style={styles.providerIcon} />
    </Pressable>
  );
}

export function AccountPanel({ onSkip }: { onSkip: () => void }) {
  const theme = useTheme();
  const { scheme } = useAppTheme();
  const dark = scheme === 'dark';
  const [mode, setMode] = useState<Mode>('create');
  const [fields, setFields] = useState<Fields>({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof Fields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _cleared, ...rest }) => rest);
  };

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
  }

  function submit() {
    const found = validateAccountForm(mode, fields);
    setErrors(found);
    if (Object.keys(found).length) return;
    toast.info(COMING_SOON);
  }

  const comingSoon = () => toast.info(COMING_SOON);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.brand}>
        <OrdinaMark size={56} color={theme.primary} />
        <ThemedText style={styles.welcome}>Welcome to ORDINA</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.welcomeSub}>
          Create an account to keep your plan safe across phones.
        </ThemedText>
      </View>

      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
        {([['create', 'Create account'], ['login', 'Log in']] as const).map(([id, label]) => {
          const active = mode === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => switchMode(id)}
              style={[styles.tab, active && { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={[styles.tabText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.form}>
        {mode === 'create' ? (
          <AuthField
            label="Full name"
            value={fields.name}
            onChangeText={set('name')}
            placeholder="Your name"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            error={errors.name}
          />
        ) : null}
        <AuthField
          label="Email"
          value={fields.email}
          onChangeText={set('email')}
          placeholder="you@example.com"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={errors.email}
        />
        <AuthField
          label="Password"
          value={fields.password}
          onChangeText={set('password')}
          placeholder={mode === 'create' ? `At least ${PASSWORD_MIN} characters` : 'Your password'}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          textContentType={mode === 'create' ? 'newPassword' : 'password'}
          autoCapitalize="none"
          isPassword
          error={errors.password}
        />
        {mode === 'create' ? (
          <AuthField
            label="Confirm password"
            value={fields.confirm}
            onChangeText={set('confirm')}
            placeholder="Type it again"
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            isPassword
            error={errors.confirm}
          />
        ) : (
          <Pressable accessibilityRole="link" onPress={comingSoon} hitSlop={8} style={styles.forgot}>
            <ThemedText style={[styles.link, { color: theme.primary }]}>Forgot password?</ThemedText>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          style={({ pressed }) => [styles.submit, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText style={styles.submitText}>{mode === 'create' ? 'Create account' : 'Log in'}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <ThemedText themeColor="textSecondary" style={styles.dividerText}>or continue with</ThemedText>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>

      <View style={styles.providers}>
        {/* Google sign-in branding: light #FFFFFF / #747775 / #1F1F1F, dark #131314 / #8E918F / #E3E3E3. */}
        <ProviderButton
          label="Continue with Google"
          onPress={comingSoon}
          background={dark ? '#131314' : '#FFFFFF'}
          border={dark ? '#8E918F' : '#747775'}
          color={dark ? '#E3E3E3' : '#1F1F1F'}
          icon={<GoogleG />}
        />
        {/* Sign in with Apple: black button on light backgrounds, white on dark. */}
        <ProviderButton
          label="Continue with Apple"
          onPress={comingSoon}
          background={dark ? '#FFFFFF' : '#000000'}
          border={dark ? '#FFFFFF' : '#000000'}
          color={dark ? '#000000' : '#FFFFFF'}
          icon={<Ionicons name="logo-apple" size={20} color={dark ? '#000000' : '#FFFFFF'} />}
        />
        <ProviderButton
          label="Continue with email"
          onPress={comingSoon}
          background={theme.card}
          border={theme.border}
          color={theme.text}
          icon={<Ionicons name="mail-outline" size={20} color={theme.primary} />}
        />
      </View>

      <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8} style={styles.skip}>
        <ThemedText themeColor="textSecondary" style={styles.skipText}>Continue without an account</ThemedText>
      </Pressable>
    </View>
  );
}

/** Small card shown after "Continue without an account", to open the account screen again. */
export function AccountPrompt({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.prompt, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <OrdinaMark size={36} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.promptTitle}>Using ORDINA without an account</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.promptSub}>Your tasks stay on this phone. Tap to create an account or log in.</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 18 },
  brand: { alignItems: 'center', gap: 4 },
  welcome: { fontSize: 20, fontFamily: 'Poppins_700Bold', marginTop: 6, textAlign: 'center' },
  welcomeSub: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  tabs: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  tabText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  form: { gap: 14 },
  forgot: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  link: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  submit: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Poppins_700Bold' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12 },
  providers: { gap: 10 },
  provider: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14 },
  providerIcon: { width: 24, alignItems: 'center' },
  providerText: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Poppins_500Medium' },
  skip: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  skipText: { fontSize: 13, textDecorationLine: 'underline' },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  promptTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  promptSub: { fontSize: 12, lineHeight: 17 },
});
