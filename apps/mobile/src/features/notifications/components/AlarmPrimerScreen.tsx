import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { t } from '../../../lib/i18n';
import { useSnackbarStore } from '../../../state/snackbar';
import { usePrimerFinish } from '../hooks/usePrimerFinish';
import { dismissAlarmPrimer, requestExactAlarm } from '../permissions';
import { PermissionPrimer } from './PermissionPrimer';

/**
 * PERM-ALARM (screens-bake.md section 6), Android only. UNVERIFIED on a device (AN-01): the system
 * page's wording and whether returning from it resolves the promise.
 */
export function AlarmPrimerScreen({ bakeId }: { bakeId: string }) {
  const finish = usePrimerFinish(bakeId);
  const [busy, setBusy] = useState(false);

  const later = () => {
    void dismissAlarmPrimer().finally(finish);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      later();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await requestExactAlarm();
      if (status === 'granted') {
        useSnackbarStore.getState().show({ message: t('reminders.onTime') });
      }
      // Still denied: `banner.alarmOff` shows on the live view.
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <PermissionPrimer
        testID="perm-alarm"
        title={t('perm.alarm.title')}
        body={t('perm.alarm.body')}
        footnote={t('perm.alarm.how')}
        allowLabel={t('perm.alarm.allow')}
        laterLabel={t('perm.alarm.later')}
        busy={busy}
        onAllow={() => void allow()}
        onLater={later}
      />
    </>
  );
}
