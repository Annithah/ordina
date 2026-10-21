/**
 * Notification buttons (Done, Snooze, Move to tomorrow...) pressed while ORDINA is closed:
 * Android starts this background task, which updates the phone's database and re-plans the
 * notifications without opening the app. Defined when the app bundle loads (index.js).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const NOTIFICATION_TASK = 'ordina-notification-actions';

if (Platform.OS !== 'web' && !(Platform.OS === 'android' && Constants.appOwnership === 'expo')) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  TaskManager.defineTask(NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data || typeof data !== 'object' || !('actionIdentifier' in data)) return;
    const { handleResponse } = await import('@/services/notifications');
    await handleResponse(data as import('expo-notifications').NotificationResponse, { navigate: false });
  });
}
