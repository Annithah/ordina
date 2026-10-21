/**
 * "🔔 Never miss what matters": shown before Android's permission question, only when reminders
 * are first useful. Also the one-time tip when reminders may be stopped by battery saving.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { patchState, useNotificationPrompt, useNotificationTips } from '@/services/notifications';
import { openBatterySettings } from '../../modules/ordina-alarms';

export function NotificationPrompt() {
  const theme = useTheme();
  const { t } = useI18n();
  const { visible, resolve } = useNotificationPrompt();
  const battery = useNotificationTips((s) => s.battery);

  const closeBattery = () => {
    useNotificationTips.setState({ battery: false });
    void patchState({ batteryTipShown: true });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => resolve?.(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="notifications" size={30} color={theme.primary} />
            </View>
            <ThemedText style={styles.title}>{t('notifPrompt.title')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>{t('notifPrompt.body')}</ThemedText>
            <View style={styles.points}>
              {(['notifPrompt.point1', 'notifPrompt.point2', 'notifPrompt.point3'] as const).map((key, index) => (
                <View key={key} style={styles.point}>
                  <Ionicons name={(['alarm-outline', 'sunny-outline', 'options-outline'] as const)[index]} size={18} color={theme.primary} />
                  <ThemedText style={styles.pointText}>{t(key)}</ThemedText>
                </View>
              ))}
            </View>
            <PrimaryButton label={t('notifPrompt.turnOn')} onPress={() => resolve?.(true)} />
            <Pressable accessibilityRole="button" onPress={() => resolve?.(false)} style={styles.later}>
              <ThemedText style={styles.laterText}>{t('notifPrompt.notNow')}</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={battery && !visible} transparent animationType="fade" onRequestClose={closeBattery}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={[styles.icon, { backgroundColor: `${theme.warning}22` }]}>
              <Ionicons name="battery-charging-outline" size={30} color={theme.warning} />
            </View>
            <ThemedText style={styles.title}>{t('notifSettings.missedTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>{t('notifSettings.batteryTip')}</ThemedText>
            <PrimaryButton
              label={t('notifSettings.openBattery')}
              onPress={() => {
                openBatterySettings();
                closeBattery();
              }}
            />
            <Pressable accessibilityRole="button" onPress={closeBattery} style={styles.later}>
              <ThemedText style={styles.laterText}>{t('notifPrompt.notNow')}</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 24, padding: 22, gap: 12, alignItems: 'stretch' },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  points: { gap: 8, marginVertical: 4 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { flex: 1, fontSize: 14 },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: 'Poppins_600SemiBold' },
});
