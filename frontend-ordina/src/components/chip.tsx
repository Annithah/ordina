import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/** A pill button for choices and filters. 40 pt tall with an extra hit area (44 pt+). */
export function Chip({
  label,
  active,
  onPress,
  color,
  icon,
  trailingIcon,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
  icon?: IconName;
  trailingIcon?: IconName;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const tint = color ?? theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? tint : theme.border,
          backgroundColor: active ? `${tint}1F` : theme.card,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? tint : theme.textSecondary} /> : null}
      <ThemedText style={[styles.text, { color: active ? tint : theme.text }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {trailingIcon ? <Ionicons name={trailingIcon} size={14} color={active ? tint : theme.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 40, maxWidth: 260 },
  text: { fontSize: 13, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
});
