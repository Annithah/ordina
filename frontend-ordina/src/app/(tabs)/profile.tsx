/**
 * Profile tab. Signed out: the account panel (optional; "Continue without an account" is
 * remembered). Signed in: avatar with initials, name, email, last backup time and sync status,
 * Backup now, Sign out (never deletes tasks on the phone). Settings is always one tap away.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountPanel, AccountPrompt } from '@/components/account-panel';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SettingsRow, SettingsSection, useSyncLabel } from '@/components/settings-ui';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { syncNow, useSyncStore } from '@/services/sync';
import { useAuthStore } from '@/store/auth-store';

// Remembers "Continue without an account" so the account panel doesn't open every time.
const ACCOUNT_SKIPPED_KEY = 'ordina.accountSkipped';

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}

function useSkipped() {
  const [skipped, setSkipped] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(ACCOUNT_SKIPPED_KEY)
      .then((value) => alive && setSkipped(value === '1'))
      .catch(() => alive && setSkipped(false));
    return () => {
      alive = false;
    };
  }, []);
  const update = (value: boolean) => {
    setSkipped(value);
    void (value ? SecureStore.setItemAsync(ACCOUNT_SKIPPED_KEY, '1') : SecureStore.deleteItemAsync(ACCOUNT_SKIPPED_KEY)).catch(() => undefined);
  };
  return { skipped, skip: () => update(true), open: () => update(false) };
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { isSignedIn, user, signOut } = useAuthStore();
  const { status, lastSyncAt } = useSyncStore();
  const sync = useSyncLabel(status, lastSyncAt);
  const account = useSkipped();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <ThemedText style={styles.screenTitle} accessibilityRole="header">{t('tabs.profile')}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings.title')} hitSlop={8} onPress={() => router.push('/settings')} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="settings-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {isSignedIn && user ? (
            <>
              <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View accessible accessibilityLabel={t('account.avatar', { initials: initials(user.name, user.email) })} style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <ThemedText style={styles.avatarText}>{initials(user.name, user.email)}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.userName} numberOfLines={1}>{user.name}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.userEmail} numberOfLines={1}>{user.email}</ThemedText>
                </View>
              </View>

              <SettingsSection title={t('account.syncStatus')}>
                <SettingsRow
                  icon={sync.icon}
                  label={sync.text}
                  onPress={status === 'error' || status === 'waiting' ? () => void syncNow() : undefined}
                  right={status === 'syncing' ? <ActivityIndicator color={theme.primary} /> : <View />}
                />
                <SettingsRow icon="cloud-upload-outline" label={t('backup.backupNow')} onPress={status === 'syncing' ? undefined : () => void syncNow()} />
                <SettingsRow icon="cloud-outline" label={t('settings.backupRow')} last onPress={() => router.push('/backup')} />
              </SettingsSection>

              <SettingsSection title={t('settings.account')}>
                <SettingsRow icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} />
                <SettingsRow icon="log-out-outline" label={t('account.signOut')} danger last onPress={() => setConfirmSignOut(true)} />
              </SettingsSection>
            </>
          ) : (
            <>
              {account.skipped === false ? <AccountPanel onSkip={account.skip} /> : null}
              {account.skipped ? <AccountPrompt onOpen={account.open} /> : null}
              <SettingsSection title={t('settings.title')}>
                <SettingsRow icon="cloud-outline" label={t('settings.backupRow')} onPress={() => router.push('/backup')} />
                <SettingsRow icon="settings-outline" label={t('settings.title')} last onPress={() => router.push('/settings')} />
              </SettingsSection>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmSignOut}
        title={t('account.signOutTitle')}
        message={t('account.signOutBody')}
        confirmLabel={t('account.signOut')}
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut().then(() => toast.success(t('account.signedOut')));
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  screenTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, gap: 20, paddingTop: 8, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 18, padding: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Poppins_600SemiBold' },
  userName: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  userEmail: { fontSize: 13, marginTop: 1 },
});
