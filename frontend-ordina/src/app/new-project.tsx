import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useProjectsStore } from '@/store/projects-store';

export default function NewProjectScreen() {
  const theme = useTheme();
  const isSignedIn = useAuthStore((state) => state.isSignedIn);
  const addProject = useProjectsStore((state) => state.addProject);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  async function save() {
    if (!name.trim()) return;
    if (!isSignedIn) {
      Alert.alert('Sign in required', 'Please sign in before creating a project.', [
        { text: 'Sign in', onPress: () => router.replace('/sign-in') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    try {
      await addProject({ name: name.trim(), description, dueDate: dueDate || undefined, priority });
    } catch (error: any) {
      if (error?.response?.status === 401) {
        Alert.alert('Session expired', 'Please sign in again before saving this project.', [
          { text: 'Sign in', onPress: () => router.replace('/sign-in') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert('Project', error?.response?.data?.message || error?.message || 'Unable to save the project.');
      return;
    }
    router.back();
  }

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
    <View style={styles.header}><ThemedText style={styles.title}>New Project</ThemedText><Pressable onPress={() => router.back()}><ThemedText>Close</ThemedText></Pressable></View>
    <View style={styles.form}>
      <ThemedText themeColor="textSecondary">PROJECT NAME</ThemedText>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Mobile app launch" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.input, color: theme.text }]} />
      <ThemedText themeColor="textSecondary">DESCRIPTION</ThemedText>
      <TextInput value={description} onChangeText={setDescription} multiline placeholder="What is this project about?" placeholderTextColor={theme.textSecondary} style={[styles.area, { backgroundColor: theme.input, color: theme.text }]} />
      <ThemedText themeColor="textSecondary">DUE DATE</ThemedText>
      <TextInput value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.input, color: theme.text }]} />
      <ThemedText themeColor="textSecondary">PRIORITY</ThemedText>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {['low', 'medium', 'high'].map((item) => (
          <Pressable key={item} onPress={() => setPriority(item)} style={{ borderWidth: 1, borderColor: priority === item ? theme.primary : theme.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
            <ThemedText>{item}</ThemedText>
          </Pressable>
        ))}
      </View>
      <PrimaryButton label="Create Project" onPress={() => void save()} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 }, title: { fontSize: 22, fontFamily: 'Poppins_700Bold' }, form: { padding: 20, gap: 10 }, input: { borderRadius: 10, padding: 14, marginBottom: 10 }, area: { minHeight: 100, borderRadius: 10, padding: 14, marginBottom: 10, textAlignVertical: 'top' } });
