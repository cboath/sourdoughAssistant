/**
 * The one place where the notification service is created and attached to the seams.
 * Called once from the app shell (`src/shell/NotificationsHost.tsx`), after the DB gate.
 *
 * - Schedule seam (`setScheduleSideEffects`): a new bake runs a `diff` reconcile.
 * - Live seam (RN-08, `setLiveSideEffects`): every live change runs `rescheduleBake(bakeId)`.
 */
import type { Repositories } from '../../db/repositories';
import { clock } from '../../lib/clock';
import { flags } from '../../lib/flags';
import { logger } from '../../lib/logger';
import { setLiveSideEffects } from '../live/sideEffects';
import { setScheduleSideEffects } from '../schedule/sideEffects';
import { META_KEYS } from './constants';
import { expoNotifier } from './expoNotifier';
import { rescheduleBake, setNotificationService } from './instance';
import { setAlarmPrimerPersistence } from './permissions';
import { createNotificationService, type NotificationService } from './service';
import { usePermissions } from './store';

export function registerNotifications(repos: Repositories): NotificationService {
  const service = createNotificationService({
    bakes: repos.bakes,
    notifier: expoNotifier,
    now: clock.now,
    zone: clock.zone,
    readyEnabled: () => flags.readyNotification,
  });
  setNotificationService(service);

  setAlarmPrimerPersistence((at) => repos.meta.set(META_KEYS.alarmPrimerShownAt, at));
  repos.meta
    .get(META_KEYS.alarmPrimerShownAt)
    .then((at) => {
      if (at) usePermissions.getState().set({ alarmPrimerShownAt: at });
    })
    .catch((error: unknown) => logger.error('notif.meta_read_failed', error));

  setScheduleSideEffects({
    onBakeScheduled: async () => {
      // A new bake is a fresh reason to show the budget hint again.
      usePermissions.setState((s) => ({ dismissed: { ...s.dismissed, budget: false } }));
      await service.reconcile({ mode: 'diff' });
    },
  });
  setLiveSideEffects({
    onBakeProgressChanged: (bakeId) => {
      void rescheduleBake(bakeId);
    },
  });
  return service;
}

export function unregisterNotifications(): void {
  setNotificationService(null);
  setAlarmPrimerPersistence(null);
  setScheduleSideEffects(null);
  setLiveSideEffects(null);
}
