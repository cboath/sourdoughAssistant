/**
 * The expo-notifications implementation of `NotifierPort` (IO-01 guidance, docs/native/ios-notifications.md
 * section 6). Only hooks and services import this; components never do (architecture section 3).
 *
 * iOS: absolute DATE triggers, no `channelId` or `delivery`, `interruptionLevel` from the intent,
 * `threadIdentifier` = bake id. Android: `channelId` and `delivery` from the intent.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from '../../lib/logger';
import { hashOf } from './payload';
import { classifyPermission } from './spikeCore';
import type {
  ExactAlarmStatus,
  NotificationIntent,
  NotifierPort,
  PendingRequest,
  PermissionStatus,
} from './types';

/** `provisional` still delivers (quietly), so it counts as granted. */
export function toPermissionStatus(
  settings: Parameters<typeof classifyPermission>[0],
): PermissionStatus {
  const state = classifyPermission(settings);
  if (state === 'authorized' || state === 'provisional') return 'granted';
  return state === 'denied' ? 'denied' : 'undetermined';
}

/** Foreground presentation: banner, list and sound, as ADR 0011 section 4 prescribes. Call once. */
export function installNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function readExactAlarm(): Promise<ExactAlarmStatus> {
  if (Platform.OS !== 'android') return 'notApplicable';
  try {
    const result = await Notifications.getExactAlarmPermissionsAsync();
    return result.granted ? 'granted' : 'denied';
  } catch (error) {
    // UNVERIFIED (AN-01): treat an error as denied so we pick `bestEffort`, never a throwing alarm.
    logger.error('notif.exact_alarm_read_failed', error);
    return 'denied';
  }
}

export const expoNotifier: NotifierPort = {
  // A getter so tests can switch `Platform.OS`.
  get platform() {
    return Platform.OS === 'ios' ? 'ios' : 'android';
  },

  async getPermission() {
    return toPermissionStatus(await Notifications.getPermissionsAsync());
  },

  getExactAlarm: readExactAlarm,

  async listPending(): Promise<PendingRequest[]> {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.map((r) => ({ identifier: r.identifier, hash: hashOf(r.content.data) }));
  },

  async schedule(intent: NotificationIntent) {
    await Notifications.scheduleNotificationAsync({
      identifier: intent.id,
      content: {
        title: intent.title,
        body: intent.body,
        sound: 'default',
        data: { ...intent.data },
        ...(intent.interruptionLevel ? { interruptionLevel: intent.interruptionLevel } : {}),
        ...(intent.threadId ? { threadIdentifier: intent.threadId } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: intent.fireAtMs,
        ...(intent.channelId ? { channelId: intent.channelId } : {}),
        ...(intent.delivery ? { delivery: intent.delivery } : {}),
      },
    });
  },

  async cancel(identifier: string) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
};
