/**
 * Permission actions behind the primers and banners (ADR 0011 sections 5 to 7, screens-bake.md
 * sections 5 to 7). Hooks and screens call these; they never import expo-notifications directly.
 *
 * Rules: the system prompt only follows an explicit tap on the primer's or banner's button, and
 * once denied it never shows again, so the denied path opens system Settings.
 */
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { logger } from '../../lib/logger';
import { ensureChannels } from './channels';
import { getNotificationService, reconcileNotifications } from './instance';
import { toPermissionStatus, readExactAlarm } from './expoNotifier';
import { usePermissions } from './store';
import type { ExactAlarmStatus, PermissionStatus } from './types';

export type PostScheduleRoute = 'permission-notifications' | 'permission-alarm' | 'live';

/** screens-bake.md 3.6 step 5: where to go after the bake is saved. Pure. */
export function decidePostSchedule(input: {
  notifications: PermissionStatus | 'unknown';
  exactAlarm: ExactAlarmStatus | 'unknown';
  alarmPrimerShownAt: string | null;
}): PostScheduleRoute {
  if (input.notifications === 'undetermined') return 'permission-notifications';
  if (
    input.notifications === 'granted' &&
    input.exactAlarm === 'denied' &&
    !input.alarmPrimerShownAt
  ) {
    return 'permission-alarm';
  }
  return 'live';
}

/** Refreshes the OS state, then decides. The plan screen pushes the primer or opens the live view. */
export async function resolvePostScheduleRoute(): Promise<PostScheduleRoute> {
  try {
    await getNotificationService()?.refreshPermissions();
  } catch (error) {
    logger.error('notif.refresh_failed', error);
  }
  const s = usePermissions.getState();
  return decidePostSchedule(s);
}

/** The system prompt (iOS alert and sound, no badge, no provisional; Android POST_NOTIFICATIONS). */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  // Android 13 shows the prompt only once a channel exists.
  await ensureChannels();
  let status: PermissionStatus = 'denied';
  try {
    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    status = toPermissionStatus(result);
  } catch (error) {
    logger.error('notif.permission_request_failed', error);
  }
  usePermissions.getState().set({ notifications: status });
  logger.info('notif.permission_result', { granted: status === 'granted' });
  if (status === 'granted') await reconcileNotifications({ mode: 'rebuild' });
  return status;
}

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    logger.error('notif.open_settings_failed', error);
  }
}

/**
 * `banner.notifOff` "Turn on": undetermined asks, denied opens Settings. The re-check and the
 * `rebuild` happen when the app returns to the foreground (`useNotificationLifecycle`).
 */
export async function turnOnReminders(): Promise<PermissionStatus> {
  const current = toPermissionStatus(await Notifications.getPermissionsAsync());
  if (current === 'undetermined') return requestNotificationPermission();
  if (current === 'denied') await openAppSettings();
  usePermissions.getState().set({ notifications: current });
  return current;
}

async function markAlarmPrimerShown(): Promise<void> {
  const at = new Date().toISOString();
  usePermissions.getState().set({ alarmPrimerShownAt: at });
  await persistAlarmPrimerShown?.(at);
}

let persistAlarmPrimerShown: ((at: string) => Promise<void>) | null = null;
/** `register.ts` wires `app_meta` persistence. */
export function setAlarmPrimerPersistence(fn: ((at: string) => Promise<void>) | null): void {
  persistAlarmPrimerShown = fn;
}

/** PERM-ALARM "Not now": the banner is the only ask from here on. */
export async function dismissAlarmPrimer(): Promise<void> {
  await markAlarmPrimerShown();
}

/**
 * Opens the system "Alarms & reminders" page and resolves when the user returns.
 * UNVERIFIED (AN-01): needs `android.permission.SCHEDULE_EXACT_ALARM` in the manifest. If it is
 * missing the call rejects, and we report `denied` instead of crashing. If the user revokes the
 * permission on that screen Android restarts the app and this never resolves; the next launch
 * re-reads the state.
 */
export async function requestExactAlarm(): Promise<ExactAlarmStatus> {
  if (Platform.OS !== 'android') return 'notApplicable';
  await markAlarmPrimerShown();
  try {
    await Notifications.requestExactAlarmPermissionsAsync();
  } catch (error) {
    logger.error('notif.exact_alarm_request_failed', error);
  }
  const status = await readExactAlarm();
  usePermissions.getState().set({ exactAlarm: status });
  if (status === 'granted') await reconcileNotifications({ mode: 'rebuild' });
  return status;
}

/** `banner.notifFailed` "Try again". */
export async function retryReminders(): Promise<boolean> {
  const result = await reconcileNotifications({ mode: 'rebuild' });
  const ok = result !== null && result.failed === 0 && result.status === 'ok';
  const store = usePermissions.getState();
  store.set({ failedAttempts: ok ? 0 : store.failedAttempts + 1 });
  return ok;
}
