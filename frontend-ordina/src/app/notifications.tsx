import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useProductivityStore } from '@/store/productivity-store';
import { href } from '@/utils/href';

export default function NotificationsScreen() {
  const theme = useTheme();
  const { notifications, loadNotifications, markAllNotificationsRead, markNotificationRead, deleteNotification } =
    useProductivityStore();

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  function openRelated(item: (typeof notifications)[number]) {
    void markNotificationRead(item.id);
    if (item.relatedType === 'task' && item.relatedId) {
      router.push(href(`/new-task?id=${item.relatedId}`));
      return;
    }
    if (item.relatedType === 'project' && item.relatedId) {
      router.push(href(`/project/${item.relatedId}`));
      return;
    }
    if (item.relatedType === 'goal') {
      router.push(href('/goals'));
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Notifications</ThemedText>
        <Pressable onPress={() => void markAllNotificationsRead()}>
          <ThemedText style={{ color: theme.primary }}>Mark all read</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {notifications.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={() => openRelated(notification)}
            style={[styles.card, { backgroundColor: theme.card, opacity: notification.read ? 0.65 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: theme.primary }]}>
              <Ionicons name="notifications" size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.cardTitle}>{notification.title}</ThemedText>
              <ThemedText themeColor="textSecondary">{notification.message}</ThemedText>
            </View>
            <Pressable onPress={() => void deleteNotification(notification.id)}>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </Pressable>
          </Pressable>
        ))}
        {notifications.length === 0 && <ThemedText themeColor="textSecondary">No notifications yet.</ThemedText>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 14, marginBottom: 10, alignItems: 'center' },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', flex: 1 },
});
