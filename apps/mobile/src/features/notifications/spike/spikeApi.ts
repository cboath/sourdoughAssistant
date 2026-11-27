/**
 * IO-01 spike: thin expo-notifications wrapper. DEVELOPMENT ONLY. Imported solely by
 * `NotificationSpikeScreen`, which release builds never load (see `app/dev-notifications.tsx`).
 * Logger rules: static events and numeric fields only, never titles, bodies or ids.
 */
import * as Notifications from 'expo-notifications';
import { logger } from '../../../lib/logger';
import {
  classifyPermission,
  isSpikeId,
  planSpikeBatch,
  summarizePending,
  type PendingSummary,
  type SpikeLevel,
  type SpikePermission,
} from '../spikeCore';

export const SPIKE_CATEGORY = 'satest-actions';

export interface SpikePermissionInfo {
  state: SpikePermission;
  canAskAgain: boolean;
  alert: boolean | null;
  sound: boolean | null;
  lockScreen: boolean | null;
  previews: number | null;
  alertStyle: number | null;
  criticalAlerts: boolean | null;
}

function toInfo(s: Notifications.NotificationPermissionsStatus): SpikePermissionInfo {
  return {
    state: classifyPermission(s),
    canAskAgain: s.canAskAgain,
    alert: s.ios?.allowsAlert ?? null,
    sound: s.ios?.allowsSound ?? null,
    lockScreen: s.ios?.allowsDisplayOnLockScreen ?? null,
    previews: s.ios?.allowsPreviews ?? null,
    alertStyle: s.ios?.alertStyle ?? null,
    criticalAlerts: s.ios?.allowsCriticalAlerts ?? null,
  };
}

/** Foreground presentation: show banner and play sound, as ADR 0011 section 4 prescribes. */
export function installSpikeHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function readPermission(): Promise<SpikePermissionInfo> {
  return toInfo(await Notifications.getPermissionsAsync());
}

/**
 * `provisional: true` requests quiet delivery without a prompt. Otherwise the standard
 * alert and sound prompt (no badge, no critical alerts).
 */
export async function requestPermission(provisional: boolean): Promise<SpikePermissionInfo> {
  const result = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
      allowProvisional: provisional,
    },
  });
  logger.info('notif.spike.permission', { provisional });
  return toInfo(result);
}

export async function registerSpikeCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(SPIKE_CATEGORY, [
    { identifier: 'done', buttonTitle: 'Mark done', options: { opensAppToForeground: false } },
    { identifier: 'open', buttonTitle: 'Open', options: { opensAppToForeground: true } },
  ]);
}

export interface ScheduleSpikeOptions {
  count: number;
  firstDelaySec: number;
  spacingSec: number;
  level: SpikeLevel;
  sound: boolean;
  withCategory: boolean;
}

export interface ScheduleSpikeResult {
  requested: number;
  scheduled: number;
  failed: number;
}

export async function scheduleSpikeBatch(opts: ScheduleSpikeOptions): Promise<ScheduleSpikeResult> {
  const items = planSpikeBatch({ ...opts, nowMs: Date.now() });
  let scheduled = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: item.identifier,
        content: {
          title: `Spike test ${item.position}`,
          body: `Level ${opts.level}`,
          sound: opts.sound ? 'default' : false,
          interruptionLevel: opts.level,
          threadIdentifier: 'satest',
          ...(opts.withCategory ? { categoryIdentifier: SPIKE_CATEGORY } : {}),
          data: { v: 1, kind: 'test' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.fireAtMs,
        },
      });
      scheduled += 1;
    } catch (error) {
      failed += 1;
      logger.warn('notif.spike.schedule_failed', { index: item.position });
      logger.error('notif.spike.schedule_error', error);
    }
  }
  logger.info('notif.spike.scheduled', { requested: items.length, scheduled, failed });
  return { requested: items.length, scheduled, failed };
}

export async function listPending(): Promise<PendingSummary> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const summary = summarizePending(all.map((r) => r.identifier));
  logger.info('notif.spike.pending', { ...summary });
  return summary;
}

/** Cancels only `satest:` requests. Never `cancelAllScheduledNotificationsAsync` (would hit `sa1:`). */
export async function cancelSpike(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const ids = all.map((r) => r.identifier).filter(isSpikeId);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  logger.info('notif.spike.cancelled', { count: ids.length });
  return ids.length;
}
