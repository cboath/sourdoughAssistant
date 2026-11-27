import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureChannels } from '../channels';
import { expoNotifier, readExactAlarm, toPermissionStatus } from '../expoNotifier';
import { planNotifications } from '../planner';
import { HOUR, T0, overnightBake } from './fixtures';

jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  jest.clearAllMocks();
});

const intents = (platform: 'ios' | 'android') =>
  planNotifications({
    bakes: [overnightBake({ startMs: T0 + HOUR })],
    nowMs: T0,
    zone: 'UTC',
    locale: 'en-US',
    platform,
    exactAlarm: true,
    readyEnabled: false,
  }).intents;

describe('toPermissionStatus', () => {
  const ios = (status: number) => ({
    granted: status >= 2,
    canAskAgain: status === 0,
    ios: { status },
  });
  it('maps iOS statuses; provisional still delivers', () => {
    expect(toPermissionStatus(ios(0) as never)).toBe('undetermined');
    expect(toPermissionStatus(ios(1) as never)).toBe('denied');
    expect(toPermissionStatus(ios(2) as never)).toBe('granted');
    expect(toPermissionStatus(ios(3) as never)).toBe('granted');
  });
  it('maps Android grants and permanent denials', () => {
    expect(toPermissionStatus({ granted: true, canAskAgain: true } as never)).toBe('granted');
    expect(toPermissionStatus({ granted: false, canAskAgain: false } as never)).toBe('denied');
    expect(toPermissionStatus({ granted: false, canAskAgain: true } as never)).toBe('undetermined');
  });
});

describe('schedule on iOS', () => {
  it('uses an absolute DATE trigger with the id, level and thread, and no channel or delivery', async () => {
    const start = intents('ios').find((i) => i.kind === 'start')!;
    await expoNotifier.schedule(start);
    const arg = mocked.scheduleNotificationAsync.mock.calls[0]![0] as unknown as {
      identifier: string;
      content: Record<string, unknown>;
      trigger: Record<string, unknown>;
    };
    expect(arg.identifier).toBe(start.id);
    expect(arg.trigger).toEqual({ type: 'date', date: start.fireAtMs });
    expect(arg.content).toMatchObject({
      title: start.title,
      body: start.body,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      threadIdentifier: start.bakeId,
    });
    expect(arg.content.data).toMatchObject({ v: 1, kind: 'start', hash: start.data.hash });
  });
});

describe('schedule on Android', () => {
  it('passes the channel and delivery on the trigger and no interruption level', async () => {
    Platform.OS = 'android';
    const start = intents('android').find((i) => i.kind === 'start')!;
    await expoNotifier.schedule(start);
    const arg = mocked.scheduleNotificationAsync.mock.calls[0]![0] as unknown as {
      content: Record<string, unknown>;
      trigger: Record<string, unknown>;
    };
    expect(arg.trigger).toEqual({
      type: 'date',
      date: start.fireAtMs,
      channelId: 'bake-steps-v1',
      delivery: 'alarmClock',
    });
    expect(arg.content).not.toHaveProperty('interruptionLevel');
    expect(expoNotifier.platform).toBe('android');
  });
});

describe('listPending and cancel', () => {
  it('reads the content hash and ignores payloads that are not ours', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: 'sa1:a', content: { data: { v: 1, hash: 'abc' } } },
      { identifier: 'satest:1', content: { data: { v: 1, kind: 'test' } } },
      { identifier: 'x', content: { data: {} } },
    ] as never);
    expect(await expoNotifier.listPending()).toEqual([
      { identifier: 'sa1:a', hash: 'abc' },
      { identifier: 'satest:1', hash: null },
      { identifier: 'x', hash: null },
    ]);
  });

  it('cancels by id and never calls cancelAll', async () => {
    await expoNotifier.cancel('sa1:a');
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('sa1:a');
    expect(mocked.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});

describe('exact alarm', () => {
  it('is not applicable on iOS', async () => {
    expect(await readExactAlarm()).toBe('notApplicable');
    expect(mocked.getExactAlarmPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports granted and denied on Android, and treats a failure as denied', async () => {
    Platform.OS = 'android';
    mocked.getExactAlarmPermissionsAsync.mockResolvedValueOnce({ granted: true } as never);
    expect(await readExactAlarm()).toBe('granted');
    mocked.getExactAlarmPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    expect(await readExactAlarm()).toBe('denied');
    mocked.getExactAlarmPermissionsAsync.mockRejectedValueOnce(new Error('nope'));
    expect(await readExactAlarm()).toBe('denied');
  });
});

describe('Android channels', () => {
  it('creates three versioned channels, high importance for steps, PRIVATE lock screen, no bypassDnd', async () => {
    Platform.OS = 'android';
    await ensureChannels();
    const calls = mocked.setNotificationChannelAsync.mock.calls;
    expect(calls.map((c) => c[0]).sort()).toEqual([
      'bake-headsup-v1',
      'bake-steps-v1',
      'general-v1',
    ]);
    const steps = calls.find((c) => c[0] === 'bake-steps-v1')![1] as Record<string, unknown>;
    expect(steps).toMatchObject({ importance: 4, lockscreenVisibility: 2 });
    for (const [, config] of calls) {
      expect(config).toMatchObject({ lockscreenVisibility: 2 });
      expect(config).not.toHaveProperty('bypassDnd');
    }
  });

  it('does nothing on iOS', async () => {
    await ensureChannels();
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
