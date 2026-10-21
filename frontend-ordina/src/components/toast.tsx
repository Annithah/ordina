import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type ToastKind = 'success' | 'error' | 'info';

type ToastAction = { label: string; onPress: () => void; duration?: number };

type ToastState = {
  toast: { id: number; kind: ToastKind; message: string; actions: ToastAction[]; duration?: number } | null;
  show: (kind: ToastKind, message: string, actions?: ToastAction[], duration?: number) => void;
  hide: () => void;
};

const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (kind, message, actions = [], duration) => set({ toast: { id: Date.now(), kind, message, actions, duration } }),
  hide: () => set({ toast: null }),
}));

/** Short, non-blocking feedback that works the same on Android, iOS and web. */
export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  info: (message: string) => useToastStore.getState().show('info', message),
  /** A message with one button, e.g. "Task deleted · Undo". */
  action: (message: string, action: ToastAction) => useToastStore.getState().show('info', message, [action], action.duration),
  /** Up to two buttons, e.g. "3 tasks added · Undo · View". */
  actions: (kind: ToastKind, message: string, actions: ToastAction[], duration = 5000) => useToastStore.getState().show(kind, message, actions.slice(0, 2), duration),
};

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, current.duration ?? (current.kind === 'success' ? 2500 : 4000));
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;
  const color = current.kind === 'success' ? theme.success : current.kind === 'info' ? theme.primary : theme.danger;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={hide}
        style={[styles.toast, { backgroundColor: theme.card, borderColor: color }]}>
        <Ionicons name={current.kind === 'success' ? 'checkmark-circle' : current.kind === 'info' ? 'information-circle' : 'alert-circle'} size={20} color={color} />
        <ThemedText style={styles.text}>{current.message}</ThemedText>
        {current.actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              action.onPress();
              hide();
            }}
            style={styles.action}>
            <ThemedText style={[styles.actionText, { color }]}>{action.label}</ThemedText>
          </Pressable>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    width: '100%',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.15)',
  },
  text: { flex: 1, fontSize: 14 },
  action: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  actionText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});
