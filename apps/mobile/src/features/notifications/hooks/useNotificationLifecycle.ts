/**
 * Launch and foreground behavior (architecture section 12 step 6, ADR 0011 section 2 triggers):
 * - cold start, after the first frame: refresh permissions, zone check, `rebuild`
 * - `AppState` becomes active: refresh permissions, then `diff` (or `rebuild` after a new grant
 *   or a zone change)
 * - a notification arrives in the foreground: `diff`, to top up
 */
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { Repositories } from '../../../db/repositories';
import { clock } from '../../../lib/clock';
import { logger } from '../../../lib/logger';
import { META_KEYS } from '../constants';
import { ensureChannels } from '../channels';
import { installNotificationHandler } from '../expoNotifier';
import { registerNotifications, unregisterNotifications } from '../register';
import { usePermissions } from '../store';

export function useNotificationLifecycle(repos: Repositories): void {
  useEffect(() => {
    installNotificationHandler();
    const service = registerNotifications(repos);
    let lastZone = clock.zone();
    let cancelled = false;

    const rememberZone = () =>
      repos.meta
        .set(META_KEYS.lastTimeZone, lastZone)
        .catch((error: unknown) => logger.error('notif.meta_write_failed', error));

    const coldStart = async () => {
      await ensureChannels();
      const stored = await repos.meta.get(META_KEYS.lastTimeZone);
      if (stored && stored !== lastZone) logger.info('notif.zone_changed');
      await service.reconcile({ mode: 'rebuild' });
      if (!cancelled) await rememberZone();
    };
    // `InteractionManager` is gone in RN 0.88: wait one frame, then a macrotask, so the first
    // screen paints before the reconcile reads the database.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        coldStart().catch((error: unknown) => logger.error('notif.cold_start_failed', error));
      }, 0);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onActive = async () => {
      const before = usePermissions.getState().notifications;
      await service.refreshPermissions();
      const after = usePermissions.getState().notifications;
      const zone = clock.zone();
      const zoneChanged = zone !== lastZone;
      const newlyGranted = before !== 'granted' && after === 'granted';
      if (zoneChanged) {
        lastZone = zone;
        await rememberZone();
      }
      await service.reconcile({ mode: zoneChanged || newlyGranted ? 'rebuild' : 'diff' });
    };
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        onActive().catch((error: unknown) => logger.error('notif.foreground_failed', error));
      }
    });
    const received = Notifications.addNotificationReceivedListener(() => {
      service.reconcile({ mode: 'diff' }).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      appState.remove();
      received.remove();
      unregisterNotifications();
    };
  }, [repos]);
}
