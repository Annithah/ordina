/**
 * Settings > Backup & sync: back up everything to one file (share it to Google Drive, WhatsApp,
 * email) and restore it on this or a new phone (replace or merge).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import type { BackupFile } from '@/features/backup-format';
import { dateKey } from '@/features/notification-plan';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { applyBackup, exportBackup, pickBackup } from '@/services/backup';
import { getState } from '@/services/notifications';

/** No backup, or the last one is more than a week old. */
function isStale(lastBackupAt: string | null) {
  return !lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > 7 * 86_400_000;
}

export default function BackupScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [restore, setRestore] = useState<{ backup: BackupFile; counts: Record<string, number> } | null>(null);

  const refresh = useCallback(() => {
    void getState().then((state) => setLastBackupAt(state.lastBackupAt ?? null)).catch(() => undefined);
  }, []);
  useFocusEffect(refresh);

  function lastLabel() {
    if (!lastBackupAt) return t('backup.never');
    const date = new Date(lastBackupAt);
    const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    const day = dateKey(date) === dateKey(new Date())
      ? t('task.today').toLowerCase()
      : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return t('backup.last', { day, time });
  }

  async function backUpNow() {
    setBusy('export');
    try {
      const result = await exportBackup();
      toast.success(t('backup.done', { n: result.tasks }));
      refresh();
    } catch {
      toast.error(t('backup.failed'));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile() {
    setBusy('import');
    try {
      const picked = await pickBackup();
      if (picked.ok) setRestore({ backup: picked.backup, counts: picked.counts });
      else if (picked.error !== 'cancelled') toast.error(t(`backup.errors.${picked.error}`));
    } finally {
      setBusy(null);
    }
  }

  async function apply(mode: 'replace' | 'merge') {
    const chosen = restore;
    setRestore(null);
    if (!chosen) return;
    setBusy('import');
    try {
      await applyBackup(chosen.backup, mode);
      toast.success(t('backup.restored', { n: chosen.counts.tasks }));
    } catch {
      toast.error(t('backup.restoreFailed'));
    } finally {
      setBusy(null);
    }
  }

  const stale = isStale(lastBackupAt);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>{t('backup.title')}</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.status, { backgroundColor: stale ? `${theme.warning}14` : `${theme.success}14`, borderColor: stale ? theme.warning : theme.success }]}>
          <Ionicons name={stale ? 'shield-outline' : 'shield-checkmark'} size={28} color={stale ? theme.warning : theme.success} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.statusTitle}>{lastLabel()}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.hint}>{stale ? t('backup.staleHint') : t('backup.okHint')}</ThemedText>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText style={styles.cardTitle}>{t('backup.exportTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.hint}>{t('backup.exportBody')}</ThemedText>
          <PrimaryButton label={busy === 'export' ? '…' : t('backup.now')} disabled={Boolean(busy)} onPress={() => void backUpNow()} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText style={styles.cardTitle}>{t('backup.importTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.hint}>{t('backup.importBody')}</ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => void chooseFile()}
            style={[styles.secondary, { borderColor: theme.primary }]}>
            {busy === 'import' ? <ActivityIndicator color={theme.primary} /> : <Ionicons name="folder-open-outline" size={18} color={theme.primary} />}
            <ThemedText style={[styles.secondaryText, { color: theme.primary }]}>{t('backup.choose')}</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.syncHead}>
            <Ionicons name="cloud-outline" size={20} color={theme.textSecondary} />
            <ThemedText style={[styles.cardTitle, { flex: 1 }]}>{t('backup.syncTitle')}</ThemedText>
            <View style={[styles.soon, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={[styles.soonText, { color: theme.primary }]}>{t('backup.soon')}</ThemedText>
            </View>
          </View>
          <ThemedText themeColor="textSecondary" style={styles.hint}>{t('backup.syncBody')}</ThemedText>
        </View>
      </ScrollView>

      <Modal visible={Boolean(restore)} transparent animationType="fade" onRequestClose={() => setRestore(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRestore(null)}>
          <Pressable style={[styles.dialog, { backgroundColor: theme.card }]}>
            <ThemedText style={styles.cardTitle}>{t('backup.restoreTitle')}</ThemedText>
            {restore ? (
              <ThemedText themeColor="textSecondary" style={styles.hint}>
                {t('backup.restoreBody', {
                  tasks: restore.counts.tasks,
                  categories: restore.counts.categories,
                  chats: restore.counts.conversations,
                  date: new Date(restore.backup.exportedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
                })}
              </ThemedText>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => void apply('merge')} style={[styles.option, { borderColor: theme.border }]}>
              <Ionicons name="git-merge-outline" size={20} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.optionTitle}>{t('backup.merge')}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.hint}>{t('backup.mergeHint')}</ThemedText>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void apply('replace')} style={[styles.option, { borderColor: theme.danger }]}>
              <Ionicons name="swap-horizontal-outline" size={20} color={theme.danger} />
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.optionTitle, { color: theme.danger }]}>{t('backup.replace')}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.hint}>{t('backup.replaceHint')}</ThemedText>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setRestore(null)} style={styles.cancel}>
              <ThemedText style={{ fontFamily: 'Poppins_600SemiBold' }}>{t('common.cancel')}</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  content: { gap: 14, paddingVertical: 8, paddingBottom: 40 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 },
  statusTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  hint: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 999, minHeight: 50 },
  secondaryText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  syncHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  soon: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  soonText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 20, padding: 18, gap: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  optionTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
