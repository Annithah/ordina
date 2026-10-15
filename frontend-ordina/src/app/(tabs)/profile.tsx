/**
 * ORDINA Profile & Settings Screen
 * Matches the dark-mode mockup (light mode default).
 * Shows: user avatar, name, email, preferences, AI settings, notifications.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { href } from '@/utils/href';
import * as Linking from 'expo-linking';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAppTheme } from '@/providers/theme-provider';
import { useI18n } from '@/providers/i18n-provider';
import { deleteAccount } from '@/services/ai';
import { disconnectGoogleCalendar } from '@/services/google-calendar';
import { useAuthStore } from '@/store/auth-store';
import { LOCALES } from '@/i18n/translations';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;

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
  const languageLabel = LOCALES.find((item) => item.id === locale)?.native ?? 'English';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Top right settings icon */}
      <View style={styles.topBar}>
        <ThemedText style={styles.screenTitle}>{t('profile.title')}</ThemedText>
        <Pressable hitSlop={8} onPress={() => router.push(href('/language'))}>
          <Ionicons name="language-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]}
      >
        {/* User card */}
        <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
        </View>

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
          <SettingRow
            label="Google Calendar, contacts & permissions"
            onPress={() => router.push(href('/integrations'))}
          />
          <SettingRow label="Reminders" onPress={() => router.push(href('/reminders'))} />
          <SettingRow label="Replay introduction" onPress={() => router.push(href('/onboarding'))} />
        </View>

        {/* Account */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel title="ACCOUNT" />
          {PRIVACY_URL ? (
            <SettingRow label="Privacy policy" onPress={() => void Linking.openURL(PRIVACY_URL)} />
          ) : null}
          <Pressable
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
          </Pressable>
          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace(href('/sign-in')));
            }}
            style={[styles.settingRow, { borderBottomColor: theme.border }]}>
            <ThemedText style={[styles.settingLabel, { color: theme.danger }]}>{t('profile.signOut')}</ThemedText>
          </Pressable>
        </View>

        {/* Notifications link */}
        <Pressable
          onPress={() => router.push(href('/notifications'))}
          style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="notifications-outline" size={20} color={theme.primary} />
          <ThemedText style={styles.notifLinkText}>View Notifications</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push(href('/goals'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="flag-outline" size={20} color={theme.primary} />
          <ThemedText style={styles.notifLinkText}>Manage Goals</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push(href('/integrations'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="phone-portrait-outline" size={20} color={theme.primary} />
          <ThemedText style={styles.notifLinkText}>Phone integrations</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push(href('/reminders'))} style={[styles.notifLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="alarm-outline" size={20} color={theme.primary} />
          <ThemedText style={styles.notifLinkText}>Manage Reminders</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>

        <ThemedText themeColor="textSecondary" style={styles.version}>
          ORDINA v1.0.0 • Put order in your day
        </ThemedText>
      </ScrollView>
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
