/**
 * Settings > Notifications: every kind of notification can be turned off or tuned, with the
 * phone's permission status, quiet hours, a test button and help when reminders arrive late.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { LOCAL_MODE } from '@/config/release';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import {
  batteryUnrestricted,
  exactAlarmsAllowed,
  formatClock,
  getState,
  patchState,
  permissionStatus,
  requestSystemPermission,
  sendTestNotification,
  type PermissionStatus,
} from '@/services/notifications';
import { useNotificationSettings } from '@/store/notification-settings-store';
import { openBatterySettings, openExactAlarmSettings } from '../../modules/ordina-alarms';
import { formatDuration } from '@/utils/task-planning';

function pickTime(value: string, onPick: (time: string) => void) {
  const [h, m] = value.split(':').map(Number);
  if (Platform.OS !== 'android') return;
  DateTimePickerAndroid.open({
    value: new Date(2000, 0, 1, h, m),
    mode: 'time',
    onChange: (event: DateTimePickerEvent, chosen?: Date) => {
      if (event.type === 'set' && chosen) onPick(`${String(chosen.getHours()).padStart(2, '0')}:${String(chosen.getMinutes()).padStart(2, '0')}`);
    },
  });
}

function Row({ icon, label, hint, value, onChange, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={20} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {hint ? <ThemedText themeColor="textSecondary" style={styles.hint}>{hint}</ThemedText> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Choices<T extends string | number>({ options, value, onChange, label, disabled }: {
  options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label?: string; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.choiceBlock, { opacity: disabled ? 0.5 : 1 }]}>
      {label ? <ThemedText themeColor="textSecondary" style={styles.hint}>{label}</ThemedText> : null}
      <View style={styles.choices}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.choice, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.backgroundSelected : theme.background }]}>
              <ThemedText style={[styles.choiceText, { color: active ? theme.primary : theme.text }]}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TimeButton({ label, value, onChange, disabled }: { label: string; value: string; onChange: (time: string) => void; disabled?: boolean }) {
  const theme = useTheme();
  const { locale } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${formatClock(value, locale)}`}
      disabled={disabled}
      onPress={() => pickTime(value, onChange)}
      style={[styles.timeRow, { borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}>
      <ThemedText themeColor="textSecondary" style={{ flex: 1 }}>{label}</ThemedText>
      <ThemedText style={[styles.timeValue, { color: theme.primary }]}>{formatClock(value, locale)}</ThemedText>
      <Ionicons name="time-outline" size={16} color={theme.primary} />
    </Pressable>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <ThemedText themeColor="textSecondary" style={styles.sectionTitle}>{title}</ThemedText>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>{children}</View>
    </View>
  );
}


export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const settings = useNotificationSettings((s) => s.settings);
  const update = useNotificationSettings((s) => s.update);
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [exact, setExact] = useState(true);
  const [battery, setBattery] = useState(true);
  const [exactTipDismissed, setExactTipDismissed] = useState(true);

  const refresh = useCallback(() => {
    void permissionStatus().then((result) => setPermission(result.status));
    setExact(exactAlarmsAllowed());
    setBattery(batteryUnrestricted());
    void getState().then((state) => setExactTipDismissed(Boolean(state.exactTipDismissed)));
  }, []);
  useFocusEffect(refresh);

  const on = settings.enabled && permission === 'granted';

  async function toggleMaster(value: boolean) {
    if (value && permission !== 'granted') {
      const granted = await requestSystemPermission();
      refresh();
      if (!granted) {
        toast.info(t('notifSettings.offInPhone'));
        return;
      }
    }
    await update({ enabled: value });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>{t('notifSettings.title')}</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Row
            icon={on ? 'notifications' : 'notifications-off-outline'}
            label={t('notifSettings.master')}
            hint={permission === 'denied' ? t('notifSettings.offInPhone') : permission === 'unavailable' ? t('notifSettings.unavailable') : t('notifSettings.masterHint')}
            value={on}
            onChange={(value) => void toggleMaster(value)}
            disabled={permission === 'unavailable'}
          />
          {permission === 'denied' ? (
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={[styles.linkButton, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="open-outline" size={16} color={theme.primary} />
              <ThemedText style={[styles.linkText, { color: theme.primary }]}>{t('notifSettings.openPhoneSettings')}</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {Platform.OS === 'android' && !exact && !exactTipDismissed && on ? (
          <View style={[styles.tip, { borderColor: theme.warning, backgroundColor: `${theme.warning}14` }]}>
            <Ionicons name="alarm-outline" size={20} color={theme.warning} />
            <View style={{ flex: 1, gap: 6 }}>
              <ThemedText style={styles.label}>{t('notifSettings.exactTip')}</ThemedText>
              <View style={styles.tipActions}>
                <Pressable accessibilityRole="button" onPress={() => openExactAlarmSettings()}>
                  <ThemedText style={[styles.linkText, { color: theme.primary }]}>{t('notifSettings.allowAlarms')}</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setExactTipDismissed(true);
                    void patchState({ exactTipDismissed: true });
                  }}>
                  <ThemedText themeColor="textSecondary">{t('common.dismiss')}</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <Card title={t('notifSettings.reminders')}>
          <Row icon="alarm-outline" label={t('notifSettings.taskReminders')} value={settings.reminders} onChange={(value) => void update({ reminders: value })} disabled={!on} />
          <Choices
            label={t('notifSettings.defaultReminder')}
            disabled={!on || !settings.reminders}
            value={settings.defaultLead}
            onChange={(value) => void update({ defaultLead: value })}
            options={[0, 5, 15, 30, 60].map((value) => ({ value, label: value ? t('notifSettings.before', { time: formatDuration(value) }) : t('task.atStart') }))}
          />
          <Choices
            label={t('notifSettings.snooze')}
            disabled={!on || !settings.reminders}
            value={settings.snoozeMinutes}
            onChange={(value) => void update({ snoozeMinutes: value })}
            options={([5, 10, 15] as const).map((value) => ({ value, label: formatDuration(value) }))}
          />
          <Row icon="time-outline" label={t('notifSettings.overdue')} hint={t('notifSettings.overdueHint')} value={settings.overdue} onChange={(value) => void update({ overdue: value })} disabled={!on} />
        </Card>

        <Card title={t('notifSettings.planning')}>
          <Row icon="sunny-outline" label={t('notifSettings.morning')} hint={t('notifSettings.morningHint')} value={settings.morning} onChange={(value) => void update({ morning: value })} disabled={!on} />
          <TimeButton label={t('notifSettings.at')} value={settings.morningTime} onChange={(time) => void update({ morningTime: time })} disabled={!on || !settings.morning} />
          <Row icon="create-outline" label={t('notifSettings.planPrompt')} hint={t('notifSettings.planPromptHint')} value={settings.planPrompt} onChange={(value) => void update({ planPrompt: value })} disabled={!on || !settings.morning} />
          <Row icon="moon-outline" label={t('notifSettings.evening')} hint={t('notifSettings.eveningHint')} value={settings.evening} onChange={(value) => void update({ evening: value })} disabled={!on} />
          <TimeButton label={t('notifSettings.at')} value={settings.eveningTime} onChange={(time) => void update({ eveningTime: time })} disabled={!on || !settings.evening} />
        </Card>

        <Card title={t('notifSettings.progress')}>
          <Choices
            label={t('notifSettings.taskAdded')}
            disabled={!on}
            value={settings.taskAdded}
            onChange={(value) => void update({ taskAdded: value })}
            options={[{ value: 'inApp' as const, label: t('notifSettings.inApp') }, { value: 'notify' as const, label: t('notifSettings.alsoNotify') }]}
          />
          <Row icon="trophy-outline" label={t('notifSettings.celebrations')} value={settings.celebrations} onChange={(value) => void update({ celebrations: value })} disabled={!on} />
          <Row icon="stats-chart-outline" label={t('notifSettings.weekly')} hint={t('notifSettings.weeklyHint')} value={settings.weekly} onChange={(value) => void update({ weekly: value })} disabled={!on} />
        </Card>

        <Card title={t('notifSettings.backup')}>
          <Row icon="shield-checkmark-outline" label={t('notifSettings.backupReminders')} value={settings.backup} onChange={(value) => void update({ backup: value })} disabled={!on} />
          <Choices
            disabled={!on || !settings.backup}
            value={settings.backupFrequency}
            onChange={(value) => void update({ backupFrequency: value })}
            options={[{ value: 'weekly' as const, label: t('notifSettings.weeklyFreq') }, { value: 'monthly' as const, label: t('notifSettings.monthlyFreq') }]}
          />
        </Card>

        <Card title={t('notifSettings.quiet')}>
          <Row icon="bed-outline" label={t('notifSettings.quietHours')} hint={t('notifSettings.quietHint')} value={settings.quiet} onChange={(value) => void update({ quiet: value })} disabled={!on} />
          <TimeButton label={t('notifSettings.from')} value={settings.quietStart} onChange={(time) => void update({ quietStart: time })} disabled={!on || !settings.quiet} />
          <TimeButton label={t('notifSettings.until')} value={settings.quietEnd} onChange={(time) => void update({ quietEnd: time })} disabled={!on || !settings.quiet} />
        </Card>

        <Pressable
          accessibilityRole="button"
          disabled={!on}
          onPress={() => void sendTestNotification().then((sent) => (sent ? toast.success(t('notifSettings.testSent')) : toast.info(t('notifSettings.offInPhone'))))}
          style={[styles.bigButton, { backgroundColor: theme.primary, opacity: on ? 1 : 0.5 }]}>
          <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" />
          <ThemedText style={styles.bigButtonText}>{t('notifSettings.test')}</ThemedText>
        </Pressable>

        {Platform.OS === 'android' ? (
          <Card title={t('notifSettings.missedTitle')}>
            <View style={styles.helpRow}>
              <Ionicons name={exact ? 'checkmark-circle' : 'alert-circle'} size={20} color={exact ? theme.success : theme.warning} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>{t('notifSettings.exactLabel')}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.hint}>{exact ? t('notifSettings.exactOn') : t('notifSettings.exactTip')}</ThemedText>
              </View>
              {!exact ? (
                <Pressable accessibilityRole="button" onPress={() => openExactAlarmSettings()} style={styles.fix}>
                  <ThemedText style={[styles.linkText, { color: theme.primary }]}>{t('notifSettings.fix')}</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.helpRow}>
              <Ionicons name={battery ? 'checkmark-circle' : 'alert-circle'} size={20} color={battery ? theme.success : theme.warning} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>{t('notifSettings.batteryLabel')}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.hint}>{battery ? t('notifSettings.batteryOn') : t('notifSettings.batteryTip')}</ThemedText>
              </View>
              {!battery ? (
                <Pressable accessibilityRole="button" onPress={() => (openBatterySettings() ? undefined : void Linking.openSettings())} style={styles.fix}>
                  <ThemedText style={[styles.linkText, { color: theme.primary }]}>{t('notifSettings.fix')}</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <ThemedText themeColor="textSecondary" style={styles.hint}>{t('notifSettings.brandsHint')}</ThemedText>
          </Card>
        ) : null}

        {LOCAL_MODE ? (
          <Pressable
            accessibilityRole="button"
            disabled={!on}
            onPress={() => void sendTestNotification(1).then((sent) => (sent ? toast.success(t('notifSettings.devScheduled')) : undefined))}
            style={[styles.devButton, { borderColor: theme.border }]}>
            <Ionicons name="construct-outline" size={16} color={theme.textSecondary} />
            <ThemedText themeColor="textSecondary">{t('notifSettings.devTest')}</ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  content: { gap: 16, paddingVertical: 8, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  hint: { fontSize: 12, lineHeight: 17 },
  choiceBlock: { gap: 6, paddingLeft: 32 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  choiceText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginLeft: 32 },
  timeValue: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  linkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, minHeight: 44 },
  linkText: { fontFamily: 'Poppins_600SemiBold' },
  tip: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  tipActions: { flexDirection: 'row', gap: 18 },
  bigButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, minHeight: 50 },
  bigButtonText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fix: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  devButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, minHeight: 44 },
});
