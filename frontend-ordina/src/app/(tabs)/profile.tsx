/**
 * ORDINA Profile & Settings Screen
 * Matches the dark-mode mockup (light mode default).
 * Shows: user avatar, name, email, preferences, AI settings, notifications.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { href } from '@/utils/href';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountPanel, AccountPrompt } from '@/components/account-panel';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAppTheme } from '@/providers/theme-provider';
import { useI18n } from '@/providers/i18n-provider';
import { deleteAccount } from '@/services/ai';
import { disconnectGoogleCalendar } from '@/services/google-calendar';
import { useAuthStore } from '@/store/auth-store';
import { LOCALES } from '@/i18n/translations';
import { FEATURES, LOCAL_MODE } from '@/config/release';
import { deleteAllLocalData } from '@/services/local-tasks';
import { toast } from '@/components/toast';
import { useTasksStore } from '@/store/tasks-store';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
// Remembers "Continue without an account" so the account screen doesn't open every time.
const ACCOUNT_SKIPPED_KEY = 'ordina.accountSkipped';

/** Account screen state (design only: sign-in is not connected yet). */
function useAccountScreen() {
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

interface SettingRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
}

function SettingRow({ label, value, onPress, showChevron = true }: SettingRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.settingRow, { borderBottomColor: theme.border }]}
    >
      <ThemedText style={styles.settingLabel}>{label}</ThemedText>
      <View style={styles.settingRight}>
        {value && (
          <ThemedText themeColor="textSecondary" style={styles.settingValue}>
            {value}
          </ThemedText>
        )}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        )}
      </View>
    </Pressable>
  );
}

function SectionLabel({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <ThemedText
      style={[styles.sectionLabel, { color: theme.textSecondary }]}
      themeColor="textSecondary"
    >
      {title}
    </ThemedText>
  );
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { preference, setPreference } = useAppTheme();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const languageLabel = LOCALES.find((item) => item.id === locale)?.native ?? 'English';
  // Offline build: no real account yet, so show the account screen instead of the user card.
  const account = useAccountScreen();
  const showAccountDesign = !FEATURES.accounts;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Top right settings icon */}
      <View style={styles.topBar}>
        <ThemedText style={styles.screenTitle}>{t('profile.title')}</ThemedText>
        <Pressable hitSlop={8} onPress={() => router.push(href('/language'))}>
          <Ionicons name="language-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]}
      >
        {showAccountDesign && account.skipped === false ? <AccountPanel onSkip={account.skip} /> : null}
        {showAccountDesign && account.skipped ? <AccountPrompt onOpen={account.open} /> : null}

        {/* User card */}
        {!showAccountDesign ? <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.avatarText}>
              {(user?.name ?? 'O').slice(0, 1).toUpperCase()}
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.userName}>{user?.name ?? t('profile.guest')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.userEmail}>
              {user?.email ?? t('profile.signInHint')}
            </ThemedText>
          </View>
        </View> : null}

        {/* Preferences */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel title={t('profile.preferences')} />
          <View style={styles.themeRow}>
            <ThemedText style={styles.settingLabel}>{t('profile.theme')}</ThemedText>
            <View style={[styles.themeOptions, { backgroundColor: theme.backgroundElement }]}>
              {(
                [
                  { id: 'light' as const, icon: 'sunny-outline' as const, label: t('profile.light') },
                  { id: 'dark' as const, icon: 'moon-outline' as const, label: t('profile.dark') },
                  { id: 'system' as const, icon: 'phone-portrait-outline' as const, label: t('profile.system') },
                ]
              ).map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => setPreference(option.id)}
                  style={[styles.themeOption, preference === option.id && { backgroundColor: theme.primary }]}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={preference === option.id ? theme.onPrimary : theme.textSecondary}
                  />
                  <ThemedText style={{ color: preference === option.id ? theme.onPrimary : theme.textSecondary, fontSize: 12 }}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          <SettingRow label={t('profile.language')} value={languageLabel} onPress={() => router.push(href('/language'))} />
          <SettingRow label={t('profile.appLock')} onPress={() => router.push(href('/create-pin'))} />
        </View>

        {/* Connections */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel title="CONNECTIONS" />
          {FEATURES.integrations ? (
            <SettingRow
              label="Google Calendar, contacts & permissions"
              onPress={() => router.push(href('/integrations'))}
            />
          ) : null}
          {FEATURES.reminders ? <SettingRow label="Reminders" onPress={() => router.push(href('/reminders'))} /> : null}
          <SettingRow label="Replay introduction" onPress={() => router.push(href('/onboarding'))} />
        </View>

        {/* Account */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel title="ACCOUNT" />
          {PRIVACY_URL ? (
            <SettingRow label="Privacy policy" onPress={() => void Linking.openURL(PRIVACY_URL)} />
          ) : null}
          {LOCAL_MODE ? (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Delete all tasks?',
                  'This permanently deletes every task stored on this phone. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void deleteAllLocalData()
                          .then(() => loadTasks())
                          .then(() => toast.success('All tasks on this phone were deleted'))
                          .catch(() => toast.error('Could not delete the tasks. Please try again.'));
                      },
                    },
                  ],
                );
              }}
              style={[styles.settingRow, { borderBottomColor: theme.border }]}>
              <ThemedText style={[styles.settingLabel, { color: theme.danger }]}>Delete all tasks on this phone</ThemedText>
            </Pressable>
          ) : null}
          {FEATURES.accounts ? <Pressable
            onPress={() => {
              Alert.alert(
                'Delete account?',
                'This permanently deletes your ORDINA account, tasks, plans and reminders. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void deleteAccount()
                        .then(() => disconnectGoogleCalendar().catch(() => undefined))
                        .then(() => signOut())
                        .then(() => router.replace(href('/sign-in')))
                        .catch((error: any) => {
                          Alert.alert('Delete account', error?.response?.data?.message || 'Could not delete the account. Try again.');
                        });
                    },
                  },
                ],
              );
            }}
            style={[styles.settingRow, { borderBottomColor: theme.border }]}>
            <ThemedText style={[styles.settingLabel, { color: theme.danger }]}>Delete account</ThemedText>
          </Pressable> : null}
          {FEATURES.accounts ? <Pressable
            onPress={() => {
              void signOut().then(() => router.replace(href('/sign-in')));
            }}
            style={[styles.settingRow, { borderBottomColor: theme.border }]}>
            <ThemedText style={[styles.settingLabel, { color: theme.danger }]}>{t('profile.signOut')}</ThemedText>
          </Pressable> : null}
        </View>

        {/* Notifications link */}
        {FEATURES.serverWorkspace ? <Pressable
          onPress={() => router.push(href('/notifications'))}
          style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="notifications-outline" size={20} color={theme.primary} />
          <ThemedText style={styles.notifLinkText}>View Notifications</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable> : null}
        {FEATURES.serverWorkspace ? (
          <Pressable onPress={() => router.push(href('/goals'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="flag-outline" size={20} color={theme.primary} />
            <ThemedText style={styles.notifLinkText}>Manage Goals</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        {FEATURES.integrations ? (
          <Pressable onPress={() => router.push(href('/integrations'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="phone-portrait-outline" size={20} color={theme.primary} />
            <ThemedText style={styles.notifLinkText}>Phone integrations</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        {FEATURES.reminders ? (
          <Pressable onPress={() => router.push(href('/reminders'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="alarm-outline" size={20} color={theme.primary} />
            <ThemedText style={styles.notifLinkText}>Manage Reminders</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}

        <ThemedText themeColor="textSecondary" style={styles.version}>
          ORDINA v1.0.0 • Put order in your day
        </ThemedText>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  screenTitle: { fontSize: 20, fontFamily: 'Poppins_600SemiBold' },
  scroll: { paddingHorizontal: 16, gap: 16, paddingTop: 8 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  userName: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  userEmail: { fontSize: 13, marginTop: 1 },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: 'Poppins_600SemiBold',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingLabel: { fontSize: 15, fontFamily: 'Poppins_400Regular' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 14 },
  notifLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  notifLinkText: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  version: { fontSize: 12, textAlign: 'center', paddingBottom: 8 },
  themeRow: { gap: 10, paddingVertical: 12 },
  themeOptions: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  themeOption: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
});
