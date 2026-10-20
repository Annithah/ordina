import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

function dialable(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

async function open(url: string, fallback: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('ORDINA', fallback);
  }
}

/** Call / Message shortcuts for tasks linked to a phone contact. */
export function ContactActions({
  name,
  phone,
  compact = false,
}: {
  name?: string;
  phone?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  if (!phone) return null;
  const number = dialable(phone);
  return (
    <View style={styles.row}>
      {!compact && name ? (
        <ThemedText themeColor="textSecondary" style={styles.name} numberOfLines={1}>
          {name}
        </ThemedText>
      ) : null}
      <Pressable
        accessibilityLabel={`Call ${name ?? number}`}
        hitSlop={6}
        onPress={() => void open(`tel:${number}`, 'Calling is not available on this device.')}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="call" size={14} color={theme.primary} />
        {!compact ? <ThemedText style={[styles.label, { color: theme.primary }]}>Call</ThemedText> : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`Message ${name ?? number}`}
        hitSlop={6}
        onPress={() => void open(`sms:${number}`, 'Messaging is not available on this device.')}
        style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="chatbubble-ellipses" size={14} color={theme.primary} />
        {!compact ? <ThemedText style={[styles.label, { color: theme.primary }]}>Message</ThemedText> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 12, flexShrink: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
