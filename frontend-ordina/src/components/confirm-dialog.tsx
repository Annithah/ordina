import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-app confirmation (React Native's Alert buttons are not supported on web). */
export function ConfirmDialog({ visible, title, message, confirmLabel, destructive, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const theme = useTheme();
  const tint = destructive ? theme.danger : theme.primary;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Pressable accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.card }]}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.message}>{message}</ThemedText>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancel}
              style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.buttonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy }}
              disabled={busy}
              onPress={onConfirm}
              style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.7 : 1 }]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                <ThemedText style={[styles.buttonText, { color: '#FFFFFF' }]}>{confirmLabel}</ThemedText>
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
});
