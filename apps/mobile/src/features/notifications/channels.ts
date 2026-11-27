/**
 * Android notification channels (ADR 0011 section 6). Channel ids are versioned because a channel's
 * importance and lock-screen visibility cannot change once it exists (SEC-01 L3: PRIVATE from the
 * first install). Created at startup, before any permission request: Android 13 shows the
 * permission prompt only after a channel exists.
 *
 * UNVERIFIED on a device: AN-01 has not run. Check the three channels in system settings, that
 * "Bake steps" shows as high importance, and the lock-screen text with "hide sensitive content".
 * `bypassDnd` is deliberately not set (it needs the policy-access permission).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from '../../lib/i18n';
import { logger } from '../../lib/logger';
import { CHANNEL } from './constants';

/** Idempotent: creating an existing channel with the same id leaves its settings alone. */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const common = {
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    enableVibrate: true,
    showBadge: false,
    sound: 'default',
  } as const;
  try {
    await Promise.all([
      Notifications.setNotificationChannelAsync(CHANNEL.steps, {
        name: t('channel.steps.name'),
        description: t('channel.steps.desc'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        ...common,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL.headsUp, {
        name: t('channel.headsup.name'),
        description: t('channel.headsup.desc'),
        importance: Notifications.AndroidImportance.DEFAULT,
        ...common,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL.general, {
        name: t('channel.general.name'),
        description: t('channel.general.desc'),
        importance: Notifications.AndroidImportance.DEFAULT,
        ...common,
      }),
    ]);
  } catch (error) {
    logger.error('notif.channels_failed', error);
  }
}
