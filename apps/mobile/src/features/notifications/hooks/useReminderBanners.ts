import { useCallback } from 'react';
import { t } from '../../../lib/i18n';
import { useSnackbarStore } from '../../../state/snackbar';
import { requestExactAlarm, retryReminders, turnOnReminders } from '../permissions';
import { usePermissions, visibleBanners, type ReminderBanner } from '../store';

export interface BannerView {
  kind: ReminderBanner;
  variant: 'warning' | 'info';
  message: string;
  actionLabel: string | null;
  onAction: (() => void) | null;
  onDismiss: (() => void) | null;
}

/** View models for the reminder banners on Bakes home and the live view (screens-bake.md section 7). */
export function useReminderBanners(): BannerView[] {
  const notifications = usePermissions((s) => s.notifications);
  const exactAlarm = usePermissions((s) => s.exactAlarm);
  const failedCount = usePermissions((s) => s.failedCount);
  const failedAttempts = usePermissions((s) => s.failedAttempts);
  const budgetTrimmed = usePermissions((s) => s.budgetTrimmed);
  const dismissed = usePermissions((s) => s.dismissed);
  const dismiss = usePermissions((s) => s.dismiss);

  const retry = useCallback(() => {
    void retryReminders().then((ok) => {
      if (ok) useSnackbarStore.getState().show({ message: t('reminders.set') });
    });
  }, []);

  const kinds = visibleBanners({
    notifications,
    exactAlarm,
    failedCount,
    budgetTrimmed,
    dismissed,
  });
  return kinds.map((kind): BannerView => {
    switch (kind) {
      case 'notifOff':
        return {
          kind,
          variant: 'warning',
          message: t('banner.notifOff'),
          actionLabel: t('banner.notifOff.action'),
          onAction: () => void turnOnReminders(),
          onDismiss: () => dismiss('notifOff'),
        };
      case 'notifFailed':
        return {
          kind,
          variant: 'warning',
          message: t(failedAttempts > 0 ? 'banner.notifFailed.again' : 'banner.notifFailed'),
          actionLabel: t('banner.notifFailed.action'),
          onAction: retry,
          onDismiss: null,
        };
      case 'alarmOff':
        return {
          kind,
          variant: 'warning',
          message: t('banner.alarmOff'),
          actionLabel: t('banner.alarmOff.action'),
          onAction: () => void requestExactAlarm(),
          onDismiss: () => dismiss('alarmOff'),
        };
      case 'budget':
        return {
          kind,
          variant: 'info',
          message: t('banner.budget'),
          actionLabel: null,
          onAction: null,
          onDismiss: () => dismiss('budget'),
        };
    }
  });
}
