import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { scheduleLocalReminder } from '@/services/notifications';
import { useProductivityStore } from '@/store/productivity-store';

export default function RemindersScreen() {
  const theme = useTheme();
  const { reminders, loadReminders, addReminder, updateReminder, completeReminder, deleteReminder } =
    useProductivityStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  async function create() {
    if (!title.trim() || !date.trim() || !time.trim()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return;
    const remindAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(remindAt.getTime())) return;
    await addReminder({ title: title.trim(), remindAt: remindAt.toISOString(), enabled: true });
    await scheduleLocalReminder(title.trim(), 'ORDINA reminder', remindAt, { type: 'reminder' });
    setTitle('');
    setDate('');
    setTime('');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Reminders</ThemedText>
        <Pressable onPress={() => router.back()}>
          <ThemedText>Close</ThemedText>
        </Pressable>
      </View>
      <View style={styles.create}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Reminder title"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        />
        <View style={styles.row}>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { flex: 1, backgroundColor: theme.input, color: theme.text }]}
          />
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { flex: 1, backgroundColor: theme.input, color: theme.text }]}
          />
        </View>
        <PrimaryButton label="Add Reminder" onPress={() => void create()} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {reminders.map((reminder) => (
          <View key={reminder.id} style={[styles.card, { backgroundColor: theme.card }]}>
            <Pressable onPress={() => void completeReminder(reminder.id, !reminder.completed)} style={{ flex: 1 }}>
              <ThemedText style={reminder.completed ? styles.done : undefined}>{reminder.title}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {new Date(reminder.remindAt).toLocaleString()} · {reminder.status}
              </ThemedText>
            </Pressable>
            <Switch
              value={reminder.enabled !== false}
              onValueChange={(enabled) => void updateReminder(reminder.id, { enabled, status: enabled ? 'scheduled' : 'disabled' })}
              trackColor={{ true: theme.primary }}
            />
            <Pressable onPress={() => void deleteReminder(reminder.id)}>
              <ThemedText style={{ color: theme.danger }}>Delete</ThemedText>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 },
  title: { fontSize: 24, fontFamily: 'Poppins_700Bold' },
  create: { padding: 16, gap: 10 },
  input: { borderRadius: 10, padding: 14 },
  row: { flexDirection: 'row', gap: 8 },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 10 },
  done: { textDecorationLine: 'line-through', opacity: 0.5 },
});
