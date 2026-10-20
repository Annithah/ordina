import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useProductivityStore } from '@/store/productivity-store';

const STATUSES = ['not_started', 'in_progress', 'completed', 'archived'];
const PRIORITIES = ['low', 'medium', 'high'];

export default function GoalsScreen() {
  const theme = useTheme();
  const { goals, loadGoals, addGoal, updateGoal, deleteGoal } = useProductivityStore();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  async function create() {
    if (!title.trim()) return;
    await addGoal({
      title: title.trim(),
      dueDate: dueDate || undefined,
      priority,
      status: 'not_started',
    });
    setTitle('');
    setDueDate('');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Goals</ThemedText>
        <Pressable onPress={() => router.back()}>
          <ThemedText>Close</ThemedText>
        </Pressable>
      </View>
      <View style={styles.create}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a goal"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        />
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="Deadline YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        />
        <View style={styles.row}>
          {PRIORITIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setPriority(item)}
              style={[styles.chip, { borderColor: priority === item ? theme.primary : theme.border }]}>
              <ThemedText>{item}</ThemedText>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Add Goal" onPress={() => void create()} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {goals.map((goal) => (
          <View key={goal.id} style={[styles.card, { backgroundColor: theme.card }]}>
            <ThemedText style={goal.completed ? styles.done : styles.goalTitle}>{goal.title}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {goal.status.replace('_', ' ')} · {goal.priority} · {goal.progress ?? 0}%
              {goal.dueDate ? ` · ${String(goal.dueDate).slice(0, 10)}` : ''}
            </ThemedText>
            <View style={styles.row}>
              {STATUSES.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => void updateGoal(goal.id, { status, completed: status === 'completed' })}
                  style={[styles.chip, { borderColor: goal.status === status ? theme.primary : theme.border }]}>
                  <ThemedText style={{ fontSize: 11 }}>{status.replace('_', ' ')}</ThemedText>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => void deleteGoal(goal.id)}>
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
  list: { padding: 16, gap: 10 },
  card: { padding: 16, borderRadius: 12, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  goalTitle: { fontFamily: 'Poppins_600SemiBold' },
  done: { textDecorationLine: 'line-through', opacity: 0.5, fontFamily: 'Poppins_600SemiBold' },
});
