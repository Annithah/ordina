/**
 * Building blocks for Settings-style screens: grouped sections, rows with an icon (same height
 * everywhere), a switch row, a choice sheet, and the sync status line.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import type { IconName } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatMoment } from '@/i18n/format';
import type { SyncStatus } from '@/logic/sync';
import { useI18n } from '@/providers/i18n-provider';

export function SettingsSection({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionWrap}>
      <ThemedText themeColor="textSecondary" style={styles.sectionTitle} accessibilityRole="header">{title.toUpperCase()}</ThemedText>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</View>
      {footer ? <ThemedText themeColor="textSecondary" style={styles.footer}>{footer}</ThemedText> : null}
    </View>
  );
}

export function SettingsRow({ icon, label, value, onPress, danger, last, right, hint }: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  right?: ReactNode;
  hint?: string;
}) {
  const theme = useTheme();
  const tint = danger ? theme.danger : theme.primary;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={hint}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowText}>
        <ThemedText style={[styles.label, danger && { color: theme.danger }]} numberOfLines={2}>{label}</ThemedText>
        {hint ? <ThemedText themeColor="textSecondary" style={styles.hint} numberOfLines={3}>{hint}</ThemedText> : null}
      </View>
      {value ? <ThemedText themeColor="textSecondary" style={styles.value} numberOfLines={1}>{value}</ThemedText> : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} /> : null)}
    </Pressable>
  );
}

export function SwitchRow({ icon, label, hint, value, onChange, last }: { icon: IconName; label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  const theme = useTheme();
  return (
    <SettingsRow
      icon={icon}
      label={label}
      hint={hint}
      last={last}
      right={
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: theme.primary, false: theme.border }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}

export type Choice<T> = { value: T; label: string };

/** A bottom sheet with one choice per row. */
export function ChoiceSheet<T>({ visible, title, choices, selected, onSelect, onClose }: {
  visible: boolean;
  title: string;
  choices: Choice<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <ThemedText style={styles.sheetTitle} accessibilityRole="header">{title}</ThemedText>
          <ScrollView>
            {choices.map((choice, index) => {
              const active = choice.value === selected;
              return (
                <Pressable
                  key={`${String(choice.value)}-${index}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(choice.value);
                    onClose();
                  }}
                  style={[styles.choice, { borderBottomColor: theme.border }]}>
                  <ThemedText style={[styles.label, active && { color: theme.primary, fontFamily: 'Poppins_600SemiBold' }]}>{choice.label}</ThemedText>
                  {active ? <Ionicons name="checkmark" size={20} color={theme.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Last backed up: today 14:32", "Waiting for internet", "Sync error — tap to retry"… */
export function useSyncLabel(status: SyncStatus, lastSyncAt: string | null) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  switch (status) {
    case 'syncing':
      return { text: t('backup.syncing'), color: theme.primary, icon: 'sync-outline' as IconName };
    case 'waiting':
      return { text: t('backup.waiting'), color: theme.warning, icon: 'cloud-offline-outline' as IconName };
    case 'error':
      return { text: t('backup.syncError'), color: theme.danger, icon: 'alert-circle-outline' as IconName };
    case 'noServer':
      return { text: t('backup.serverNotConnected'), color: theme.warning, icon: 'server-outline' as IconName };
    default:
      return lastSyncAt
        ? { text: t('backup.lastBackup', { moment: formatMoment(locale, lastSyncAt) }), color: theme.success, icon: 'cloud-done-outline' as IconName }
        : { text: t('backup.neverBackedUp'), color: theme.textSecondary, icon: 'cloud-upload-outline' as IconName };
  }
}

const styles = StyleSheet.create({
  sectionWrap: { gap: 6 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8, fontFamily: 'Poppins_600SemiBold', paddingHorizontal: 4 },
  section: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  footer: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  label: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  hint: { fontSize: 12, lineHeight: 16 },
  value: { fontSize: 13, maxWidth: '45%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '75%', gap: 8 },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
});
