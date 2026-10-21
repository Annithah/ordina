import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type AuthFieldProps = TextInputProps & {
  label: string;
  isPassword?: boolean;
  /** Shown under the field, with a red border. */
  error?: string;
};

export function AuthField({ label, isPassword, error, style, ...rest }: AuthFieldProps) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(Boolean(isPassword));

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={[styles.field, { backgroundColor: theme.input, borderColor: error ? theme.danger : 'transparent' }]}>
        <TextInput
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          secureTextEntry={hidden}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }, style]}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((v) => !v)}
            hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.text} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    paddingVertical: 14,
  },
  error: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    marginTop: -2,
  },
});
