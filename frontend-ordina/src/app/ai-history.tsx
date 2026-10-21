/**
 * ORDINA AI chat history: past conversations grouped by day, searchable by title and message
 * text. Open one to read and continue it; rename, pin or delete it.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { groupConversations, type ConversationGroupId } from '@/features/chat-groups';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import {
  cleanupConversations,
  deleteConversation,
  getRetention,
  listConversations,
  pinConversation,
  renameConversation,
  type Conversation,
} from '@/services/chat-history';

const GROUP_LABEL: Record<ConversationGroupId, string> = {
  pinned: 'chats.pinned',
  today: 'chats.today',
  yesterday: 'chats.yesterday',
  week: 'chats.week',
  older: 'chats.older',
};

function when(iso: string, locale: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ChatHistoryScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [menu, setMenu] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  const load = useCallback(async (text: string) => {
    try {
      setItems(await listConversations(text));
    } catch {
      setItems([]);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void getRetention().then(cleanupConversations).catch(() => 0).then(() => load(query));
    // Reload on focus only; typing reloads below.
  }, [load])); // eslint-disable-line react-hooks/exhaustive-deps

  function search(text: string) {
    setQuery(text);
    void load(text);
  }

  function open(id: string | null) {
    router.dismissTo({ pathname: '/ai', params: { conversation: id ?? 'new' } });
  }

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      toast.error(t('chats.failed'));
    }
    await load(query);
  }

  const sections = groupConversations(items ?? []).map((group) => ({ id: group.id, data: group.items }));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>{t('chats.title')}</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => open(null)} style={[styles.newButton, { backgroundColor: theme.primary }]}>
          <Ionicons name="create-outline" size={17} color="#FFFFFF" />
          <ThemedText style={styles.newText}>{t('chats.new')}</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={search}
          placeholder={t('chats.search')}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={t('chats.search')}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query ? (
          <Pressable accessibilityLabel={t('common.close')} hitSlop={8} onPress={() => search('')}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {items === null ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => (
            <ThemedText themeColor="textSecondary" style={styles.groupLabel}>{t(GROUP_LABEL[section.id])}</ThemedText>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${when(item.updatedAt, locale)}`}
              onPress={() => open(item.id)}
              onLongPress={() => setMenu(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.rowIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name={item.isPinned ? 'pin' : 'chatbubble-ellipses-outline'} size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.rowHead}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>{item.title}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.rowDate}>{when(item.updatedAt, locale)}</ThemedText>
                </View>
                <ThemedText themeColor="textSecondary" style={styles.rowPreview} numberOfLines={2}>
                  {item.preview || t('chats.empty')}
                </ThemedText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('chats.actions', { title: item.title })} hitSlop={8} onPress={() => setMenu(item)} style={styles.more}>
                <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={(
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name={query ? 'search-outline' : 'chatbubbles-outline'} size={34} color={theme.primary} />
              <ThemedText style={styles.emptyTitle}>{query ? t('chats.noResults') : t('chats.noChats')}</ThemedText>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{query ? t('chats.noResultsHint') : t('chats.noChatsHint')}</ThemedText>
            </View>
          )}
        />
      )}

      <Modal visible={Boolean(menu)} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)}>
          <View style={[styles.menu, { backgroundColor: theme.card }]}>
            <ThemedText style={styles.menuTitle} numberOfLines={2}>{menu?.title}</ThemedText>
            {[
              { icon: 'create-outline' as const, label: t('chats.rename'), onPress: () => { setNewTitle(menu!.title); setRenaming(menu); } },
              { icon: (menu?.isPinned ? 'pin-outline' : 'pin') as 'pin', label: menu?.isPinned ? t('chats.unpin') : t('chats.pin'), onPress: () => void act(() => pinConversation(menu!.id, !menu!.isPinned)) },
              { icon: 'trash-outline' as const, label: t('chats.delete'), danger: true, onPress: () => setDeleting(menu) },
            ].map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => {
                  setMenu(null);
                  action.onPress();
                }}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name={action.icon} size={20} color={action.danger ? theme.danger : theme.text} />
                <ThemedText style={[styles.menuText, action.danger && { color: theme.danger }]}>{action.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(renaming)} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRenaming(null)}>
          <Pressable style={[styles.menu, { backgroundColor: theme.card, gap: 12 }]}>
            <ThemedText style={styles.menuTitle}>{t('chats.rename')}</ThemedText>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              maxLength={60}
              accessibilityLabel={t('chats.rename')}
              style={[styles.renameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
            <PrimaryButton
              label={t('common.save')}
              disabled={!newTitle.trim()}
              onPress={() => {
                const target = renaming!;
                setRenaming(null);
                void act(() => renameConversation(target.id, newTitle));
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={Boolean(deleting)}
        title={t('chats.deleteTitle')}
        message={t('chats.deleteBody', { title: deleting?.title ?? '' })}
        confirmLabel={t('chats.delete')}
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting!;
          setDeleting(null);
          void act(() => deleteConversation(target.id)).then(() => toast.success(t('chats.deleted')));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  newButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  newText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, paddingVertical: 8 },
  list: { paddingVertical: 8, paddingBottom: 40 },
  groupLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12, minHeight: 64 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  rowDate: { fontSize: 11 },
  rowPreview: { fontSize: 13, lineHeight: 18 },
  more: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 },
  menu: { borderRadius: 20, padding: 16, gap: 4 },
  menuTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', marginBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  menuText: { fontSize: 15 },
  renameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontFamily: 'Poppins_400Regular', fontSize: 15 },
});
