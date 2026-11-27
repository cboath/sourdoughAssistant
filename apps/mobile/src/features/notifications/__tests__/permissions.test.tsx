import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { setNotificationService } from '../instance';
import {
  decidePostSchedule,
  dismissAlarmPrimer,
  requestExactAlarm,
  requestNotificationPermission,
  resolvePostScheduleRoute,
  retryReminders,
  setAlarmPrimerPersistence,
  turnOnReminders,
} from '../permissions';
import type { NotificationService } from '../service';
import { usePermissions } from '../store';

jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const originalOS = Platform.OS;

const status = (s: number) =>
  ({ granted: s >= 2, canAskAgain: s === 0, ios: { status: s } }) as never;

const service = {
  reconcile: jest.fn(async () => ({
    status: 'ok',
    scheduled: 0,
    cancelled: 0,
    kept: 0,
    failed: 0,
    trimmed: { critical: 0, other: 0 },
  })),
  rescheduleBake: jest.fn(),
  cancelBake: jest.fn(),
  scheduleTestReminder: jest.fn(),
  refreshPermissions: jest.fn(async () => undefined),
} as unknown as jest.Mocked<NotificationService>;

let openSettings: jest.SpyInstance;
beforeEach(() => {
  usePermissions.getState().reset();
  setNotificationService(service);
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});
afterEach(() => {
  Platform.OS = originalOS;
  setNotificationService(null);
  setAlarmPrimerPersistence(null);
  jest.clearAllMocks();
  openSettings.mockRestore();
});

describe('decidePostSchedule (screens-bake.md 3.6 step 5)', () => {
  const cases = [
    ['undetermined', 'notApplicable', null, 'permission-notifications'],
    ['undetermined', 'denied', null, 'permission-notifications'],
    ['granted', 'denied', null, 'permission-alarm'],
    ['granted', 'denied', '2026-11-27T00:00:00Z', 'live'],
    ['granted', 'granted', null, 'live'],
    ['granted', 'notApplicable', null, 'live'],
    ['denied', 'denied', null, 'live'],
  ] as const;
  it.each(cases)('%s / %s / primer %s -> %s', (notifications, exactAlarm, shown, expected) => {
    expect(decidePostSchedule({ notifications, exactAlarm, alarmPrimerShownAt: shown })).toBe(
      expected,
    );
  });

  it('refreshes the OS state first', async () => {
    service.refreshPermissions.mockImplementationOnce(async () => {
      usePermissions.getState().set({ notifications: 'undetermined', exactAlarm: 'notApplicable' });
    });
    expect(await resolvePostScheduleRoute()).toBe('permission-notifications');
  });
});

describe('requestNotificationPermission', () => {
  it('asks for alert and sound only, no badge, no provisional, then rebuilds on a grant', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(status(2));
    expect(await requestNotificationPermission()).toBe('granted');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    expect(usePermissions.getState().notifications).toBe('granted');
    expect(service.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' });
  });

  it('records a denial and does not schedule', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(status(1));
    expect(await requestNotificationPermission()).toBe('denied');
    expect(usePermissions.getState().notifications).toBe('denied');
    expect(service.reconcile).not.toHaveBeenCalled();
  });

  it('creates the Android channels before the prompt', async () => {
    Platform.OS = 'android';
    const order: string[] = [];
    mocked.setNotificationChannelAsync.mockImplementation(async () => {
      order.push('channel');
      return null;
    });
    mocked.requestPermissionsAsync.mockImplementation(async () => {
      order.push('prompt');
      return { granted: true, canAskAgain: true } as never;
    });
    await requestNotificationPermission();
    expect(order[0]).toBe('channel');
    expect(order[order.length - 1]).toBe('prompt');
  });

  it('treats a failing request as denied instead of throwing', async () => {
    mocked.requestPermissionsAsync.mockRejectedValue(new Error('boom'));
    await expect(requestNotificationPermission()).resolves.toBe('denied');
  });
});

describe('turnOnReminders', () => {
  it('shows the system prompt when never asked', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(status(0));
    mocked.requestPermissionsAsync.mockResolvedValue(status(2));
    await turnOnReminders();
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('sends a denied user to Settings and never re-prompts', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(status(1));
    expect(await turnOnReminders()).toBe('denied');
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('exact alarm (Android, unverified on device)', () => {
  it('is a no-op on iOS', async () => {
    expect(await requestExactAlarm()).toBe('notApplicable');
    expect(mocked.requestExactAlarmPermissionsAsync).not.toHaveBeenCalled();
  });

  it('marks the primer shown, re-checks on return, and rebuilds on a grant', async () => {
    Platform.OS = 'android';
    const persist = jest.fn(async () => undefined);
    setAlarmPrimerPersistence(persist);
    mocked.requestExactAlarmPermissionsAsync.mockResolvedValue({ granted: true } as never);
    mocked.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: true } as never);
    expect(await requestExactAlarm()).toBe('granted');
    expect(usePermissions.getState().alarmPrimerShownAt).not.toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(service.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' });
  });

  it('survives a missing manifest permission (the request rejects) and reports denied', async () => {
    Platform.OS = 'android';
    mocked.requestExactAlarmPermissionsAsync.mockRejectedValue(new Error('not declared'));
    mocked.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false } as never);
    expect(await requestExactAlarm()).toBe('denied');
    expect(usePermissions.getState().exactAlarm).toBe('denied');
    expect(service.reconcile).not.toHaveBeenCalled();
  });

  it('"Not now" only records that the primer was shown', async () => {
    await dismissAlarmPrimer();
    expect(usePermissions.getState().alarmPrimerShownAt).not.toBeNull();
    expect(mocked.requestExactAlarmPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('retryReminders', () => {
  it('counts a failed retry and clears the counter on success', async () => {
    service.reconcile.mockResolvedValueOnce({
      status: 'error',
      scheduled: 0,
      cancelled: 0,
      kept: 0,
      failed: 2,
      trimmed: { critical: 0, other: 0 },
    });
    expect(await retryReminders()).toBe(false);
    expect(usePermissions.getState().failedAttempts).toBe(1);
    expect(await retryReminders()).toBe(true);
    expect(usePermissions.getState().failedAttempts).toBe(0);
  });
});
