import * as Notifications from 'expo-notifications';
import type { Repositories } from '../../../db/repositories';
import { notifyBakeScheduled } from '../../schedule/sideEffects';
import { cancelBakeNotifications, reconcileNotifications, rescheduleBake } from '../instance';
import { registerNotifications, unregisterNotifications } from '../register';
import { usePermissions } from '../store';
import { HOUR, overnightBake } from './fixtures';

jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const bake = overnightBake({ startMs: Date.now() + HOUR });

const repos = {
  bakes: {
    list: jest.fn(async () => [bake.bake]),
    get: jest.fn(async () => bake),
  },
  meta: { get: jest.fn(async () => null), set: jest.fn(async () => undefined) },
} as unknown as Repositories;

beforeEach(() => {
  usePermissions.getState().reset();
  mocked.getPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    ios: { status: 2 },
  } as never);
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mocked.scheduleNotificationAsync.mockResolvedValue('id');
});
afterEach(() => {
  unregisterNotifications();
  jest.clearAllMocks();
});

describe('registerNotifications', () => {
  it('runs a reconcile when the schedule seam reports a new bake, and a failure never escapes', async () => {
    registerNotifications(repos);
    await notifyBakeScheduled(bake.bake.id);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(21);
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('boom'));
    await expect(notifyBakeScheduled(bake.bake.id)).resolves.toBeUndefined();
  });

  it('re-arms the budget hint when a new bake is created', async () => {
    registerNotifications(repos);
    usePermissions.getState().dismiss('budget');
    await notifyBakeScheduled(bake.bake.id);
    expect(usePermissions.getState().dismissed.budget).toBe(false);
  });

  it('exposes rescheduleBake for the live screen, and is a safe no-op before registration', async () => {
    expect(await rescheduleBake(bake.bake.id)).toBeNull();
    expect(await reconcileNotifications()).toBeNull();
    expect(await cancelBakeNotifications(bake.bake.id)).toBe(0);
    registerNotifications(repos);
    const result = await rescheduleBake(bake.bake.id);
    expect(result).toMatchObject({ status: 'ok', scheduled: 21 });
  });

  it('removes its schedule handler on unregister', async () => {
    registerNotifications(repos);
    unregisterNotifications();
    await notifyBakeScheduled(bake.bake.id);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
