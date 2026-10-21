/**
 * Settings: the user's profile, account (passkey, sign out), preferences, planning and data.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { RETENTION_OPTIONS, type Retention } from '@/features/chat-groups';
import { deleteAllConversations, getRetention, setRetention } from '@/services/chat-history';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { FEATURES } from '@/config/release';
import { useCategoriesStore } from '@/store/categories-store';
import { useTheme } from '@/hooks/use-theme';
import { localeName } from '@/i18n/translations';
import { useI18n } from '@/providers/i18n-provider';
import { useAppTheme } from '@/providers/theme-provider';
import { canReachServer, currentApiBaseUrl, normalizeServerUrl, saveServerOverride } from '@/services/api';
import { countLocalTasks, deleteAllLocalData } from '@/services/local-tasks';
import { useAuthStore } from '@/store/auth-store';
import { useTasksStore } from '@/store/tasks-store';
import { href } from '@/utils/href';

type IconName = keyof typeof Ionicons.glyphMap;

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionWrap}>
      <ThemedText themeColor="textSecondary" style={styles.sectionLabel}>{title}</ThemedText>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, onPress, danger, last }: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  const tint = danger ? theme.danger : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? `${theme.danger}1A` : theme.backgroundSelected }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <ThemedText style={[styles.rowLabel, danger && { color: theme.danger }]} numberOfLines={1}>{label}</ThemedText>
      {value ? <ThemedText themeColor="textSecondary" style={styles.rowValue} numberOfLines={1}>{value}</ThemedText> : null}
      {danger ? null : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
    </Pressable>
  );
}

/** Where ORDINA AI runs (the laptop on the same Wi-Fi): see it, test it, change it without a new build. */
function AiServerRow() {
  const theme = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(currentApiBaseUrl());
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail' | 'invalid'>('idle');

  async function test(save: boolean) {
    const url = normalizeServerUrl(address);
    if (!url) {
      setState('invalid');
      return;
    }
    setAddress(url);
    setState('testing');
    const ok = await canReachServer(url);
    setState(ok ? 'ok' : 'fail');
    if (save) {
      await saveServerOverride(url);
      toast.success(t('profile.aiServerSaved'));
    }
  }

  return (
    <View>
      <Row icon="server-outline" label={t('profile.aiServer')} value={currentApiBaseUrl().replace(/^https?:\/\//, '')} onPress={() => setOpen((value) => !value)} />
      {open ? (
        <View style={[styles.serverBox, { borderBottomColor: theme.border }]}>
          <ThemedText themeColor="textSecondary" style={styles.serverHint}>{t('profile.aiServerHint')}</ThemedText>
          <TextInput
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setState('idle');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.20:4000"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('profile.aiServer')}
            style={[styles.nameInput, { color: theme.text, backgroundColor: theme.input }]}
          />
          {state !== 'idle' ? (
            <ThemedText style={[styles.serverState, { color: state === 'ok' ? theme.success : state === 'testing' ? theme.textSecondary : theme.warning }]}>
              {t(`profile.aiServer_${state}`)}
            </ThemedText>
          ) : null}
          <View style={styles.serverActions}>
            <Pressable onPress={() => void test(false)} style={[styles.serverBtn, { borderColor: theme.border }]}>
              <ThemedText style={styles.serverBtnText}>{t('profile.aiServerTest')}</ThemedText>
            </Pressable>
            <Pressable onPress={() => void test(true)} style={[styles.serverBtn, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              <ThemedText style={[styles.serverBtnText, { color: theme.onPrimary }]}>{t('common.save')}</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { preference, setPreference } = useAppTheme();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const updateName = useAuthStore((s) => s.updateName);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [confirm, setConfirm] = useState<null | 'signOut' | 'deleteTasks' | 'deleteChats'>(null);
  const [retention, setRetentionState] = useState<Retention>('forever');
  const [retentionOpen, setRetentionOpen] = useState(false);
  const retentionLabel = (value: Retention) => t(value === 'forever' ? 'chats.keepForever' : value === '30' ? 'chats.keep30' : 'chats.keep90');
  const [busy, setBusy] = useState(false);
  // Read straight from the phone's database, so it shows what is really saved.
  const [savedCount, setSavedCount] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    void getRetention().then(setRetentionState);
    void countLocalTasks().then(setSavedCount).catch(() => setSavedCount(null));
  }, []));

  const displayName = user?.name || t('profile.guest');
  const provider = user?.provider === 'google' ? 'Google' : user?.provider === 'apple' ? 'Apple' : t('profile.providerEmail');
  const categoryTotal = useCategoriesStore((s) => s.categories.filter((record) => !record.deletedAt && !record.isArchived).length);
  const categoriesValue = t('categories.categoryCount', { n: categoryTotal });

  async function saveName() {
    if (!name.trim()) return;
    await updateName(name);
    setEditing(false);
    toast.success(t('profile.nameSaved'));
  }

  async function runConfirm() {
    setBusy(true);
    try {
      if (confirm === 'signOut') {
        await signOut();
        setConfirm(null);
        router.replace(href('/sign-in'));
        return;
      }
      if (confirm === 'deleteChats') {
        await deleteAllConversations();
        toast.success(t('chats.deletedAll'));
        return;
      }
      await deleteAllLocalData();
      await loadTasks();
      setSavedCount(0);
      toast.success(t('profile.deleteTasksDone'));
    } catch {
      toast.error(t('profile.deleteTasksFailed'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <ThemedText style={styles.screenTitle}>{t('profile.title')}</ThemedText>
      </View>

      <KeyboardAwareScrollView bottomOffset={32} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {/* Profile card */}
          <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.userRow}>
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.userName} numberOfLines={1}>{displayName}</ThemedText>
                {user?.email ? (
                  <ThemedText themeColor="textSecondary" style={styles.userEmail} numberOfLines={1}>{user.email}</ThemedText>
                ) : null}
                <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons
                    name={user?.provider === 'google' ? 'logo-google' : user?.provider === 'apple' ? 'logo-apple' : 'mail-outline'}
                    size={11}
                    color={theme.primary}
                  />
                  <ThemedText style={[styles.badgeText, { color: theme.primary }]}>{t('profile.signedInWith', { provider })}</ThemedText>
                </View>
              </View>
            </View>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  accessibilityLabel={t('profile.nameLabel')}
                  placeholder={t('profile.nameLabel')}
                  placeholderTextColor={theme.textSecondary}
                  onSubmitEditing={() => void saveName()}
                  style={[styles.nameInput, { color: theme.text, backgroundColor: theme.input }]}
                />
                <Pressable onPress={() => void saveName()} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
                  <ThemedText style={{ color: theme.onPrimary, fontFamily: 'Poppins_600SemiBold' }}>{t('common.save')}</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>

          <Section title={t('profile.sectionAccount')}>
            <Row
              icon="person-outline"
              label={t('profile.editProfile')}
              onPress={() => {
                setName(user?.name ?? '');
                setEditing((value) => !value);
              }}
            />
            <Row icon="keypad-outline" label={t('profile.passkey')} onPress={() => router.push({ pathname: '/create-pin', params: { mode: 'change' } })} />
            <Row icon="log-out-outline" label={t('profile.signOut')} danger last onPress={() => setConfirm('signOut')} />
          </Section>

          <Section title={t('profile.sectionPreferences')}>
            <View style={[styles.themeRow, { borderBottomColor: theme.border }]}>
              <View style={styles.themeHead}>
                <View style={[styles.rowIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons name="contrast-outline" size={17} color={theme.primary} />
                </View>
                <ThemedText style={styles.rowLabel}>{t('profile.theme')}</ThemedText>
              </View>
              <View style={[styles.themeOptions, { backgroundColor: theme.backgroundElement }]}>
                {([
                  { id: 'light', icon: 'sunny-outline', label: t('profile.light') },
                  { id: 'dark', icon: 'moon-outline', label: t('profile.dark') },
                  { id: 'system', icon: 'phone-portrait-outline', label: t('profile.system') },
                ] as const).map((option) => {
                  const active = preference === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setPreference(option.id)}
                      style={[styles.themeOption, active && { backgroundColor: theme.primary }]}>
                      <Ionicons name={option.icon} size={15} color={active ? theme.onPrimary : theme.textSecondary} />
                      <ThemedText style={{ color: active ? theme.onPrimary : theme.textSecondary, fontSize: 12 }}>{option.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Row icon="globe-outline" label={t('profile.language')} value={localeName(locale)} last onPress={() => router.push(href('/language'))} />
          </Section>

          <Section title={t('profile.sectionPlanning')}>
            <Row icon="pricetags-outline" label={t('profile.categories')} value={categoriesValue} onPress={() => router.push(href('/categories'))} />
            {FEATURES.integrations ? (
              <Row icon="git-network-outline" label={t('profile.integrations')} onPress={() => router.push(href('/integrations'))} />
            ) : null}
            <Row icon="notifications-outline" label={t('notifSettings.title')} onPress={() => router.push(href('/notification-settings'))} />
            <Row icon="cloud-upload-outline" label={t('backup.title')} onPress={() => router.push(href('/backup'))} />
            <AiServerRow />
            <Row icon="refresh-outline" label={t('profile.replayIntro')} last onPress={() => router.push(href('/onboarding'))} />
          </Section>

          <Section title={t('chats.history')}>
            <Row icon="time-outline" label={t('chats.keepHistory')} value={retentionLabel(retention)} onPress={() => setRetentionOpen(true)} />
            <Row icon="chatbubbles-outline" label={t('chats.deleteAll')} danger last onPress={() => setConfirm('deleteChats')} />
          </Section>

          <Section title={t('profile.sectionData')}>
            {PRIVACY_URL ? (
              <Row icon="shield-checkmark-outline" label={t('profile.privacy')} onPress={() => void Linking.openURL(PRIVACY_URL)} />
            ) : null}
            <Row icon="trash-outline" label={t('profile.deleteTasks')} danger last onPress={() => setConfirm('deleteTasks')} />
          </Section>

          <ThemedText themeColor="textSecondary" style={styles.version}>
            {t('profile.version', { version: APP_VERSION })}
            {savedCount !== null ? `\n${t('profile.savedTasks', { n: savedCount })}` : ''}
          </ThemedText>
      </KeyboardAwareScrollView>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'signOut' ? t('profile.signOutTitle') : confirm === 'deleteChats' ? t('chats.deleteAllTitle') : t('profile.deleteTasksTitle')}
        message={confirm === 'signOut' ? t('profile.signOutBody') : confirm === 'deleteChats' ? t('chats.deleteAllBody') : t('profile.deleteTasksBody')}
        confirmLabel={confirm === 'signOut' ? t('profile.signOut') : t('common.delete')}
        destructive
        busy={busy}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />

      <Modal visible={retentionOpen} transparent animationType="fade" onRequestClose={() => setRetentionOpen(false)}>
        <Pressable style={styles.retentionBackdrop} onPress={() => setRetentionOpen(false)}>
          <Pressable style={[styles.retentionCard, { backgroundColor: theme.card }]}>
            <ThemedText style={styles.retentionTitle}>{t('chats.keepHistory')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.retentionHint}>{t('chats.keepHint')}</ThemedText>
            {RETENTION_OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: retention === option }}
                onPress={() => {
                  setRetentionOpen(false);
                  setRetentionState(option);
                  void setRetention(option).catch(() => toast.error(t('chats.failed')));
                }}
                style={styles.retentionOption}>
                <Ionicons name={retention === option ? 'radio-button-on' : 'radio-button-off'} size={22} color={theme.primary} />
                <ThemedText>{retentionLabel(option)}</ThemedText>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  retentionBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 },
  retentionCard: { borderRadius: 20, padding: 18, gap: 6 },
  retentionTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  retentionHint: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  retentionOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  safe: { flex: 1 },
  topBar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  screenTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold' },
  scroll: { paddingHorizontal: 16, gap: 18, paddingTop: 6, paddingBottom: 100 },
  userCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Poppins_600SemiBold' },
  userName: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  userEmail: { fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  editRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontFamily: 'Poppins_400Regular', fontSize: 15 },
  saveBtn: { borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sectionWrap: { gap: 6 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, fontFamily: 'Poppins_600SemiBold', paddingHorizontal: 4 },
  section: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 54 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  rowValue: { fontSize: 13, maxWidth: '45%' },
  themeRow: { gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  themeHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeOptions: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  themeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, paddingVertical: 8 },
  version: { fontSize: 12, textAlign: 'center' },
  serverBox: { paddingHorizontal: 14, paddingBottom: 14, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  serverHint: { fontSize: 12, lineHeight: 17 },
  serverState: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  serverActions: { flexDirection: 'row', gap: 8 },
  serverBtn: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  serverBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});
