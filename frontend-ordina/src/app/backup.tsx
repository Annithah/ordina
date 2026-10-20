/**
 * Settings → Backup & sync: backup file export/import (no account or internet needed), the
 * backup reminder, and server backup/sync status for signed-in users.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useReminderPermission } from '@/components/reminder-permission';
import { SettingsRow, SettingsSection, SwitchRow, useSyncLabel } from '@/components/settings-ui';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { formatLongDate, formatMoment } from '@/i18n/format';
import type { BackupFile, ImportMode } from '@/logic/backup';
import { useI18n } from '@/providers/i18n-provider';
import { backupErrorMessage, exportBackup, importBackup, pickBackupFile } from '@/services/backup';
import { syncNow, useSyncStore } from '@/services/sync';
import { useAuthStore } from '@/store/auth-store';
import { useSettingsStore } from '@/store/settings-store';
import { localDateKey } from '@/utils/dates';

export default function BackupScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const settings = useSettingsStore();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const { status, lastSyncAt } = useSyncStore();
  const sync = useSyncLabel(status, lastSyncAt);
  const permission = useReminderPermission();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [pending, setPending] = useState<{ file: BackupFile; mode: ImportMode } | null>(null);

  async function runExport() {
    if (busy) return;
    setBusy('export');
    try {
      const shared = await exportBackup();
      toast.success(shared ? t('backup.exported') : t('backup.shareUnavailable'));
    } catch {
      toast.error(t('backup.exportFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile() {
    if (busy) return;
    setBusy('import');
    try {
      const file = await pickBackupFile();
      if (file) setPending({ file, mode: 'merge' });
    } catch (error) {
      toast.error(backupErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!pending || busy) return;
    setBusy('import');
    try {
      const counts = await importBackup(pending.file, pending.mode);
      toast.success(pending.mode === 'replace' ? t('backup.importedReplace', counts) : t('backup.imported', counts));
      setPending(null);
    } catch (error) {
      toast.error(backupErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function toggleBackupReminder(value: boolean) {
    if (value && !(await permission.ensure())) return;
    await settings.update({ backupReminderEnabled: value });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title} accessibilityRole="header">{t('backup.title')}</ThemedText>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary" style={styles.intro}>{t('backup.intro')}</ThemedText>

        <SettingsSection title={t('backup.serverSection')} footer={isSignedIn ? undefined : t('backup.serverHint')}>
          {isSignedIn ? (
            <>
              <SettingsRow
                icon={sync.icon}
                label={sync.text}
                onPress={status === 'error' || status === 'waiting' ? () => void syncNow() : undefined}
                right={status === 'syncing' ? <ActivityIndicator color={theme.primary} /> : <View />}
              />
              <SettingsRow icon="cloud-upload-outline" label={t('backup.backupNow')} last onPress={status === 'syncing' ? undefined : () => void syncNow()} />
            </>
          ) : (
            <SettingsRow icon="person-circle-outline" label={t('backup.signIn')} last onPress={() => router.push('/(tabs)/profile')} />
          )}
        </SettingsSection>

        <SettingsSection title={t('backup.fileSection')} footer={t('backup.fileHint')}>
          <SettingsRow
            icon="share-outline"
            label={t('backup.export')}
            hint={settings.lastExportAt ? t('backup.lastExport', { moment: formatMoment(locale, settings.lastExportAt) }) : t('backup.neverExported')}
            onPress={() => void runExport()}
            right={busy === 'export' ? <ActivityIndicator color={theme.primary} /> : undefined}
          />
          <SettingsRow
            icon="download-outline"
            label={t('backup.import')}
            hint={t('backup.importHint')}
            last
            onPress={() => void chooseFile()}
            right={busy === 'import' && !pending ? <ActivityIndicator color={theme.primary} /> : undefined}
          />
        </SettingsSection>

        {isSignedIn ? null : (
          <SettingsSection title={t('backup.reminderSection')} footer={t('backup.reminderHint')}>
            <SwitchRow icon="alarm-outline" label={t('backup.reminderToggle')} value={settings.backupReminderEnabled} onChange={(value) => void toggleBackupReminder(value)} last={!settings.backupReminderEnabled} />
            {settings.backupReminderEnabled ? (
              <View style={styles.frequency}>
                <Chip label={t('backup.weekly')} active={settings.backupFrequency === 'weekly'} onPress={() => void settings.update({ backupFrequency: 'weekly' })} />
                <Chip label={t('backup.monthly')} active={settings.backupFrequency === 'monthly'} onPress={() => void settings.update({ backupFrequency: 'monthly' })} />
              </View>
            ) : null}
          </SettingsSection>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={pending !== null}
        title={t('backup.importTitle')}
        message={pending ? t('backup.importSummary', { count: pending.file.tasks.length, date: formatLongDate(locale, localDateKey(new Date(pending.file.exportedAt))) }) : ''}
        confirmLabel={pending?.mode === 'replace' ? t('backup.replace') : t('backup.merge')}
        destructive={pending?.mode === 'replace'}
        busy={busy === 'import'}
        onConfirm={() => void runImport()}
        onCancel={() => setPending(null)}>
        {pending ? (
          <View style={{ gap: 8 }}>
            {(['merge', 'replace'] as const).map((mode) => {
              const active = pending.mode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPending({ ...pending, mode })}
                  style={[styles.mode, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.backgroundSelected : 'transparent' }]}>
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? theme.primary : theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.modeTitle}>{mode === 'merge' ? t('backup.merge') : t('backup.replace')}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.modeHint}>{mode === 'merge' ? t('backup.mergeHint') : t('backup.replaceHint')}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
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
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', flexShrink: 1, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 20, width: '100%', maxWidth: 720, alignSelf: 'center' },
  intro: { fontSize: 14, lineHeight: 20 },
  frequency: { flexDirection: 'row', gap: 8, padding: 14, paddingTop: 4 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  modeTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  modeHint: { fontSize: 12, lineHeight: 17 },
});
