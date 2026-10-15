import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type ToastKind = 'success' | 'error';

type ToastState = {
  toast: { id: number; kind: ToastKind; message: string } | null;
  show: (kind: ToastKind, message: string) => void;
  hide: () => void;
};

const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (kind, message) => set({ toast: { id: Date.now(), kind, message } }),
  hide: () => set({ toast: null }),
}));

/** Short, non-blocking feedback that works the same on Android, iOS and web. */
export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
};

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, current.kind === 'error' ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;
  const color = current.kind === 'success' ? theme.success : theme.danger;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={hide}
        style={[styles.toast, { backgroundColor: theme.card, borderColor: color }]}>
        <Ionicons name={current.kind === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color={color} />
        <ThemedText style={styles.text}>{current.message}</ThemedText>
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
});
