import { router } from 'expo-router';
import { href } from '@/utils/href';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/brand-lockup';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { MAX_ATTEMPTS, useLockStore } from '@/store/lock-store';

function formatMs(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LockScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const lockUntil = useLockStore((s) => s.lockUntil);
  const { verifyPin, attempts } = useLockStore();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  async function submit(nextPin: string) {
    if (nextPin.length !== 4) return;
    const result = await verifyPin(nextPin);
    if (result === 'ok') {
      router.replace(href('/(tabs)'));
      return;
    }
    setPin('');
    if (result === 'locked') {
      setError(t('lock.lockedExit'));
      if (Platform.OS === 'android') BackHandler.exitApp();
      return;
    }
    setError(t('lock.incorrect'));
  }

  function addDigit(d: string) {
    setError('');
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  const left = MAX_ATTEMPTS - attempts;
  const wait = Math.max(0, lockUntil - now);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <BrandLockup markSize={96} wordmarkSize="md" />
      {wait > 0 ? (
        <View style={styles.copy}>
          <ThemedText style={styles.title}>{t('lock.lockedTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            {t('lock.lockedBody', { time: formatMs(wait) })}
          </ThemedText>
        </View>
      ) : (
        <>
          <ThemedText style={styles.title}>
            {user?.name ? t('lock.greeting', { name: user.name.split(' ')[0] }) : t('lock.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            {t('lock.subtitle')}
          </ThemedText>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: theme.primary,
                    backgroundColor: pin.length > i ? theme.primary : 'transparent',
                  },
                ]}
              />
            ))}
          </View>
          {error ? <ThemedText style={{ color: theme.danger, textAlign: 'center' }}>{error}</ThemedText> : null}
          {attempts > 0 ? (
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {t('lock.attemptsLeft', { n: left })}
            </ThemedText>
          ) : null}
          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
              <Pressable
                key={key || 'blank'}
                disabled={!key}
                onPress={() => {
                  if (key === 'del') setPin((v) => v.slice(0, -1));
                  else if (key) addDigit(key);
                }}
                style={[styles.key, { backgroundColor: key ? theme.card : 'transparent', borderColor: theme.border }]}>
                <ThemedText style={styles.keyText}>{key === 'del' ? '⌫' : key}</ThemedText>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={t('lock.unlock')} disabled={pin.length !== 4} onPress={() => void submit(pin)} />
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => void signOut().then(() => router.replace(href('/sign-in')))}
            style={styles.notYou}>
            <ThemedText themeColor="textSecondary" style={styles.notYouText}>{t('lock.notYou')}</ThemedText>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 10 },
  copy: { marginTop: 24, gap: 8 },
  title: { fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginTop: 16 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginVertical: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 8 },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 22, fontFamily: 'Poppins_600SemiBold' },
  notYou: { alignSelf: 'center', paddingVertical: 8 },
  notYouText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
});
