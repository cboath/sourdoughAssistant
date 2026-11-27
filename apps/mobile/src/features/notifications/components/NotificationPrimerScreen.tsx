import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { t } from '../../../lib/i18n';
import { routes } from '../../../lib/nav';
import { useSnackbarStore } from '../../../state/snackbar';
import { useFirstStepTime } from '../hooks/useFirstStepTime';
import { usePrimerFinish } from '../hooks/usePrimerFinish';
import { requestNotificationPermission } from '../permissions';
import { usePermissions } from '../store';
import { PermissionPrimer } from './PermissionPrimer';

/** PERM-NOTIF (screens-bake.md section 5). The bake is already saved, so leaving never loses it. */
export function NotificationPrimerScreen({ bakeId }: { bakeId: string }) {
  const router = useRouter();
  const finish = usePrimerFinish(bakeId);
  const firstStep = useFirstStepTime(bakeId);
  const [busy, setBusy] = useState(false);

  // System back is "Not now". It never triggers the system prompt.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [finish]);

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await requestNotificationPermission();
      if (status === 'granted') {
        const { exactAlarm, alarmPrimerShownAt } = usePermissions.getState();
        if (exactAlarm === 'denied' && !alarmPrimerShownAt) {
          router.push(routes.permissionAlarm(bakeId));
          return;
        }
        useSnackbarStore.getState().show({ message: t('reminders.on') });
      }
      // Denied: the live view shows `banner.notifOff`.
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <PermissionPrimer
        testID="perm-notif"
        scheduledMessage={firstStep ? t('perm.scheduled', { dayTime: firstStep }) : null}
        title={t('perm.notif.title')}
        body={t('perm.notif.body')}
        benefits={[t('perm.notif.b1'), t('perm.notif.b2'), t('perm.notif.b3')]}
        allowLabel={t('perm.notif.allow')}
        laterLabel={t('perm.notif.later')}
        busy={busy}
        onAllow={() => void allow()}
        onLater={finish}
      />
    </>
  );
}
