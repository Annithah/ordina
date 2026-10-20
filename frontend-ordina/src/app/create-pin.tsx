import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';
import { href } from '@/utils/href';
import { router, useLocalSearchParams } from 'expo-router';

function Pad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const theme = useTheme();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={styles.pad}>
      {keys.map((key) => (
        <Pressable
          key={key || 'blank'}
          disabled={!key}
          onPress={() => (key === 'del' ? onDelete() : key && onDigit(key))}
          style={[styles.key, { backgroundColor: key ? theme.card : 'transparent', borderColor: theme.border }]}>
          <ThemedText style={styles.keyText}>{key === 'del' ? '⌫' : key}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export default function CreatePinScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const createPin = useLockStore((s) => s.createPin);
  // Opened from Settings to change the passkey (otherwise: choosing one after Google/Apple sign-in).
  const changing = useLocalSearchParams<{ mode?: string }>().mode === 'change';
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const value = step === 'create' ? first : pin;

  function addDigit(d: string) {
    setError('');
    if (step === 'create') setFirst((v) => (v + d).slice(0, 4));
    else setPin((v) => (v + d).slice(0, 4));
  }

  function del() {
    if (step === 'create') setFirst((v) => v.slice(0, -1));
    else setPin((v) => v.slice(0, -1));
  }

  async function save() {
    if (first.length !== 4) return;
    if (step === 'create') {
      setStep('confirm');
      return;
    }
    if (pin !== first) {
      setError(t('lock.mismatch'));
      setPin('');
      return;
    }
    const hash = await createPin(first);
    // The passkey belongs to the account: it signs in with it and opens the app with it.
    await useAuthStore.getState().attachPasskey(hash);
    if (changing) {
      toast.success(t('lock.saved'));
      router.back();
    } else {
      router.replace(href('/(tabs)'));
    }
  }

  const dots = useMemo(() => [0, 1, 2, 3], []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedText style={styles.title}>
        {step === 'create' ? t(changing ? 'lock.changeTitle' : 'lock.createTitle') : t('lock.confirmTitle')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        {step === 'create' ? t('lock.createBody') : t('lock.confirmBody')}
      </ThemedText>
      <View style={styles.dots}>
        {dots.map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: theme.primary,
                backgroundColor: value.length > i ? theme.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Pad onDigit={addDigit} onDelete={del} />
      <PrimaryButton
        label={step === 'create' ? t('common.next') : t('lock.save')}
        disabled={value.length !== 4}
        onPress={() => void save()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 12 },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
  body: { fontSize: 15, lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginVertical: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 12 },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 22, fontFamily: 'Poppins_600SemiBold' },
});
