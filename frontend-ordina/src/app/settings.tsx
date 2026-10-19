/**
 * Settings, in grouped sections: Account, Preferences, Tasks, Reminders, Backup & sync,
 * Security, About. Every row works or says "Coming soon".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth-field';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useReminderPermission } from '@/components/reminder-permission';
import { ChoiceSheet, SettingsRow, SettingsSection, SwitchRow, useSyncLabel, type Choice } from '@/components/settings-ui';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/i18n';
import { formatDuration } from '@/i18n/format';
import type { WeekStart } from '@/logic/filters';
import { TIMED_REMINDER_OPTIONS, type ReminderOption } from '@/logic/reminders';
import { DURATION_PRESETS } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { useSyncStore } from '@/services/sync';
import { useAuthStore } from '@/store/auth-store';
import { useSettingsStore, type TaskView } from '@/store/settings-store';
import { friendlyError } from '@/utils/task-validation';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
// TODO(owner): add the support email or WhatsApp number here.
const CONTACT_URL = process.env.EXPO_PUBLIC_CONTACT_URL;

const REMINDER_KEY: Record<ReminderOption, string> = {
  none: 'reminders.none', start: 'reminders.start', '5': 'reminders.min5', '15': 'reminders.min15', '30': 'reminders.min30',
  '60': 'reminders.hour1', '1440': 'reminders.day1', custom: 'reminders.custom',
};

type Sheet = 'theme' | 'weekStart' | 'view' | 'duration' | 'category' | 'reminder' | null;

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { preference, setPreference } = useAppTheme();
  const settings = useSettingsStore();
  const { categories, nameOf } = useCategories();
  const { isSignedIn, user, signOut, changePassword, deleteAccount } = useAuthStore();
  const { status, lastSyncAt } = useSyncStore();
  const sync = useSyncLabel(status, lastSyncAt);
  const permission = useReminderPermission();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [passwordForm, setPasswordForm] = useState<null | { current: string; next: string; confirm: string; errors: Record<string, string>; busy: boolean }>(null);
  const [deleteForm, setDeleteForm] = useState<null | { password: string; error: string; busy: boolean }>(null);

  const languageName = LANGUAGES.find((item) => item.id === locale)?.native ?? 'English';
  const themeLabel = t(`theme.${preference}`);
  const durationLabel = settings.defaultDuration ? formatDuration(locale, settings.defaultDuration) : t('task.noDuration');

  async function toggleReminders(value: boolean) {
    if (value && !(await permission.ensure())) return;
    await settings.update({ remindersEnabled: value });
  }

  async function savePassword() {
    if (!passwordForm || passwordForm.busy) return;
    const errors: Record<string, string> = {};
    if (!passwordForm.current) errors.current = t('account.passwordRequired');
    if (passwordForm.next.length < 8) errors.next = t('account.passwordShort');
    if (passwordForm.confirm !== passwordForm.next) errors.confirm = t('account.mismatch');
    if (Object.keys(errors).length) {
      setPasswordForm({ ...passwordForm, errors });
      return;
    }
    setPasswordForm({ ...passwordForm, busy: true, errors: {} });
    try {
      await changePassword({ currentPassword: passwordForm.current, newPassword: passwordForm.next });
      toast.success(t('account.passwordChanged'));
      setPasswordForm(null);
    } catch (error) {
      setPasswordForm((form) => (form ? { ...form, busy: false, errors: { current: friendlyError(error, t('errors.generic')) } } : form));
    }
  }

  async function confirmDelete() {
    if (!deleteForm || deleteForm.busy) return;
    if (!deleteForm.password) {
      setDeleteForm({ ...deleteForm, error: t('account.passwordRequired') });
      return;
    }
    setDeleteForm({ ...deleteForm, busy: true, error: '' });
    try {
      await deleteAccount(deleteForm.password);
      toast.success(t('account.deleted'));
      setDeleteForm(null);
    } catch (error) {
      setDeleteForm((form) => (form ? { ...form, busy: false, error: friendlyError(error, t('errors.generic')) } : form));
    }
  }

  const choices: Record<Exclude<Sheet, null>, { title: string; choices: Choice<unknown>[]; selected: unknown; onSelect: (value: unknown) => void }> = {
    theme: {
      title: t('settings.theme'),
      choices: (['light', 'dark', 'system'] as const).map((value) => ({ value, label: t(`theme.${value}`) })),
      selected: preference,
      onSelect: (value) => setPreference(value as 'light' | 'dark' | 'system'),
    },
    weekStart: {
      title: t('settings.weekStart'),
      choices: (['monday', 'sunday'] as const).map((value) => ({ value, label: t(`settings.${value}`) })),
      selected: settings.weekStart,
      onSelect: (value) => void settings.update({ weekStart: value as WeekStart }),
    },
    view: {
      title: t('settings.defaultView'),
      choices: [{ value: 'time', label: t('home.viewByTime') }, { value: 'category', label: t('home.viewByCategory') }],
      selected: settings.defaultView,
      onSelect: (value) => void settings.update({ defaultView: value as TaskView, homeView: value as TaskView }),
    },
    duration: {
      title: t('settings.defaultDuration'),
      choices: [{ value: null, label: t('task.noDuration') }, ...DURATION_PRESETS.map((value) => ({ value, label: formatDuration(locale, value) }))],
      selected: settings.defaultDuration,
      onSelect: (value) => void settings.update({ defaultDuration: value as number | null }),
    },
    category: {
      title: t('settings.defaultCategory'),
      choices: categories.map((category) => ({ value: category.id, label: nameOf(category.id) })),
      selected: settings.defaultCategoryId,
      onSelect: (value) => void settings.update({ defaultCategoryId: value as string }),
    },
    reminder: {
      title: t('settings.defaultReminder'),
      choices: TIMED_REMINDER_OPTIONS.filter((option) => option !== 'custom').map((value) => ({ value, label: t(REMINDER_KEY[value]) })),
      selected: settings.defaultReminder,
      onSelect: (value) => void settings.update({ defaultReminder: value as ReminderOption }),
    },
  };
  const active = sheet ? choices[sheet] : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title} accessibilityRole="header">{t('settings.title')}</ThemedText>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title={t('settings.account')}>
          {isSignedIn ? (
            <>
              <SettingsRow icon="person-outline" label={t('settings.profile')} value={user?.email} onPress={() => router.push('/(tabs)/profile')} />
              <SettingsRow icon="key-outline" label={t('account.changePassword')} onPress={() => setPasswordForm({ current: '', next: '', confirm: '', errors: {}, busy: false })} />
              <SettingsRow icon="log-out-outline" label={t('account.signOut')} onPress={() => setConfirmSignOut(true)} />
              <SettingsRow icon="trash-outline" label={t('account.deleteAccount')} danger last onPress={() => setDeleteForm({ password: '', error: '', busy: false })} />
            </>
          ) : (
            <SettingsRow icon="person-circle-outline" label={t('settings.signedOutRow')} last onPress={() => router.push('/(tabs)/profile')} />
          )}
        </SettingsSection>

        <SettingsSection title={t('settings.preferences')}>
          <SettingsRow icon="globe-outline" label={t('settings.language')} value={languageName} onPress={() => router.push('/language')} />
          <SettingsRow icon="contrast-outline" label={t('settings.theme')} value={themeLabel} onPress={() => setSheet('theme')} />
          <SettingsRow icon="calendar-outline" label={t('settings.weekStart')} value={t(`settings.${settings.weekStart}`)} onPress={() => setSheet('weekStart')} />
          <SettingsRow icon="list-outline" label={t('settings.defaultView')} value={settings.defaultView === 'time' ? t('home.viewByTime') : t('home.viewByCategory')} last onPress={() => setSheet('view')} />
        </SettingsSection>

        <SettingsSection title={t('settings.tasks')}>
          <SettingsRow icon="hourglass-outline" label={t('settings.defaultDuration')} value={durationLabel} onPress={() => setSheet('duration')} />
          <SettingsRow icon="pricetag-outline" label={t('settings.defaultCategory')} value={nameOf(settings.defaultCategoryId)} onPress={() => setSheet('category')} />
          <SettingsRow icon="pricetags-outline" label={t('settings.manageCategories')} last onPress={() => router.push('/categories')} />
        </SettingsSection>

        <SettingsSection title={t('settings.reminders')}>
          <SwitchRow icon="notifications-outline" label={t('settings.remindersOn')} hint={t('settings.remindersOnHint')} value={settings.remindersEnabled} onChange={(value) => void toggleReminders(value)} />
          <SettingsRow icon="alarm-outline" label={t('settings.defaultReminder')} value={t(REMINDER_KEY[settings.defaultReminder])} last onPress={settings.remindersEnabled ? () => setSheet('reminder') : undefined} />
        </SettingsSection>

        <SettingsSection title={t('settings.backup')}>
          <SettingsRow icon="cloud-outline" label={t('settings.backupRow')} hint={isSignedIn ? sync.text : undefined} last onPress={() => router.push('/backup')} />
        </SettingsSection>

        <SettingsSection title={t('settings.security')}>
          <SettingsRow icon="lock-closed-outline" label={t('settings.appLock')} last onPress={() => router.push('/create-pin')} />
        </SettingsSection>

        <SettingsSection title={t('settings.about')}>
          <SettingsRow icon="information-circle-outline" label={t('settings.version')} value={Constants.expoConfig?.version ?? '2.0.0'} />
          <SettingsRow icon="play-circle-outline" label={t('settings.viewIntro')} onPress={() => router.push({ pathname: '/onboarding', params: { replay: '1' } })} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t('settings.privacy')}
            value={PRIVACY_URL ? undefined : t('common.comingSoon')}
            onPress={() => (PRIVACY_URL ? void Linking.openURL(PRIVACY_URL) : toast.info(t('settings.privacySoon')))}
          />
          <SettingsRow
            icon="mail-outline"
            label={t('settings.contact')}
            value={CONTACT_URL ? undefined : t('common.comingSoon')}
            last
            onPress={() => (CONTACT_URL ? void Linking.openURL(CONTACT_URL) : toast.info(t('settings.contactSoon')))}
          />
        </SettingsSection>
      </ScrollView>

      {active ? (
        <ChoiceSheet visible title={active.title} choices={active.choices} selected={active.selected} onSelect={active.onSelect} onClose={() => setSheet(null)} />
      ) : null}

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

      <ConfirmDialog
        visible={passwordForm !== null}
        title={t('account.changePassword')}
        message=""
        confirmLabel={t('common.save')}
        busy={passwordForm?.busy}
        onConfirm={() => void savePassword()}
        onCancel={() => setPasswordForm(null)}>
        {passwordForm ? (
          <View style={{ gap: 12 }}>
            <AuthField label={t('account.currentPassword')} isPassword autoCapitalize="none" autoComplete="current-password" value={passwordForm.current} error={passwordForm.errors.current} onChangeText={(current) => setPasswordForm({ ...passwordForm, current })} />
            <AuthField label={t('account.newPassword')} isPassword autoCapitalize="none" autoComplete="new-password" placeholder={t('account.newPasswordPlaceholder')} value={passwordForm.next} error={passwordForm.errors.next} onChangeText={(next) => setPasswordForm({ ...passwordForm, next })} />
            <AuthField label={t('account.confirm')} isPassword autoCapitalize="none" autoComplete="new-password" value={passwordForm.confirm} error={passwordForm.errors.confirm} onChangeText={(confirm) => setPasswordForm({ ...passwordForm, confirm })} />
          </View>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={deleteForm !== null}
        title={t('account.deleteTitle')}
        message={t('account.deleteBody')}
        confirmLabel={t('account.deleteAccount')}
        destructive
        busy={deleteForm?.busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteForm(null)}>
        {deleteForm ? (
          <AuthField label={t('account.deletePassword')} isPassword autoCapitalize="none" value={deleteForm.password} error={deleteForm.error || undefined} onChangeText={(password) => setDeleteForm({ ...deleteForm, password, error: '' })} />
        ) : null}
      </ConfirmDialog>
      {permission.dialogs}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
