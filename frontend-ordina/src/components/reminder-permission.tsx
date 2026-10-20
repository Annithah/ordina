/**
 * Asks for notification permission the first time the user turns a reminder on: a short
 * explanation first, then the system prompt. If notifications are blocked, it explains how to
 * allow them in the phone settings. Never throws.
 *
 *   const permission = useReminderPermission();
 *   if (await permission.ensure()) ...   // and render {permission.dialogs}
 */
import * as Linking from 'expo-linking';
import { useCallback, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { toast } from '@/components/toast';
import { useI18n } from '@/providers/i18n-provider';
import { getNotificationPermission, requestNotificationPermission } from '@/services/notifications';

type Step = 'explain' | 'denied' | null;

export function useReminderPermission() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(null);
  const resolver = useRef<((granted: boolean) => void) | null>(null);

  const finish = useCallback((granted: boolean) => {
    setStep(null);
    resolver.current?.(granted);
    resolver.current = null;
  }, []);

  const ensure = useCallback(async () => {
    const current = await getNotificationPermission();
    if (current === 'granted') return true;
    if (current === 'unavailable') {
      toast.info(t('reminders.unavailable'));
      return false;
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setStep(current === 'denied' ? 'denied' : 'explain');
    });
  }, [t]);

  const allow = useCallback(async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted') finish(true);
    else if (result === 'unavailable') {
      toast.info(t('reminders.unavailable'));
      finish(false);
    } else setStep('denied');
  }, [finish, t]);

  const dialogs = (
    <>
      <ConfirmDialog
        visible={step === 'explain'}
        title={t('reminders.permissionTitle')}
        message={t('reminders.permissionBody')}
        confirmLabel={t('reminders.allow')}
        cancelLabel={t('common.notNow')}
        onConfirm={() => void allow()}
        onCancel={() => finish(false)}
      />
      <ConfirmDialog
        visible={step === 'denied'}
        title={t('reminders.deniedTitle')}
        message={t('reminders.deniedBody')}
        confirmLabel={t('common.openSettings')}
        cancelLabel={t('common.notNow')}
        onConfirm={() => {
          finish(false);
          void Linking.openSettings().catch(() => undefined);
        }}
        onCancel={() => finish(false)}
      />
    </>
  );

  return { ensure, dialogs };
}
