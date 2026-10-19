import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Hides the cancel button (information only). */
  hideCancel?: boolean;
  /** Extra content between the message and the buttons (e.g. a choice). */
  children?: ReactNode;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-app confirmation (React Native's Alert buttons are not supported on web). */
export function ConfirmDialog({ visible, title, message, confirmLabel, cancelLabel, hideCancel, children, destructive, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const tint = destructive ? theme.danger : theme.primary;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Pressable accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.card }]}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {message ? <ThemedText themeColor="textSecondary" style={styles.message}>{message}</ThemedText> : null}
          {children ? <ScrollView style={styles.extra} contentContainerStyle={{ gap: 8 }}>{children}</ScrollView> : null}
          <View style={styles.actions}>
            {hideCancel ? null : (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onCancel}
                style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText style={styles.buttonText} numberOfLines={2}>{cancelLabel ?? t('common.cancel')}</ThemedText>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy }}
              disabled={busy}
              onPress={onConfirm}
              style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.7 : 1 }]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                <ThemedText style={[styles.buttonText, { color: '#FFFFFF' }]} numberOfLines={2}>{confirmLabel}</ThemedText>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, gap: 8 },
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  message: { fontSize: 14, lineHeight: 20 },
  extra: { maxHeight: 320, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  buttonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, textAlign: 'center' },
});
