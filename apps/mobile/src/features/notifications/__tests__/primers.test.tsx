import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { useSnackbarStore } from '../../../state/snackbar';
import { AlarmPrimerScreen } from '../components/AlarmPrimerScreen';
import { NotificationPrimerScreen } from '../components/NotificationPrimerScreen';
import { setNotificationService } from '../instance';
import type { NotificationService } from '../service';
import { usePermissions } from '../store';

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const BAKE = '00000000-0000-4000-8000-000000000001';
const status = (s: number) =>
  ({ granted: s >= 2, canAskAgain: s === 0, ios: { status: s } }) as never;
const originalOS = Platform.OS;

const service = {
  reconcile: jest.fn(async () => ({
    status: 'ok',
    scheduled: 0,
    cancelled: 0,
    kept: 0,
    failed: 0,
    trimmed: { critical: 0, other: 0 },
  })),
  refreshPermissions: jest.fn(async () => undefined),
} as unknown as jest.Mocked<NotificationService>;

beforeEach(() => {
  usePermissions.getState().reset();
  setNotificationService(service);
  useSnackbarStore.setState({ current: null });
});
afterEach(async () => {
  Platform.OS = originalOS;
  setNotificationService(null);
  clearClients();
  routerSpies.reset();
  jest.clearAllMocks();
});

const expectOpensBake = () => {
  expect(routerSpies.dismissAll).toHaveBeenCalled();
  expect(routerSpies.navigate).toHaveBeenCalledWith('/bakes');
  expect(routerSpies.push).toHaveBeenCalledWith(`/bake/${BAKE}`);
};

describe('PERM-NOTIF', () => {
  it('shows the primer copy and the benefits, and never prompts on mount', async () => {
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    expect(screen.getByText('Get a reminder for every step')).toBeTruthy();
    expect(screen.getByText('Feed, fold and shape reminders')).toBeTruthy();
    expect(screen.getByText('Works overnight and when the app is closed')).toBeTruthy();
    expect(screen.getByText('A heads-up a few minutes before each step')).toBeTruthy();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('"Not now" opens the bake and never triggers the system prompt', async () => {
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expectOpensBake();
  });

  it('"Turn on reminders" prompts, rebuilds, confirms and opens the bake', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(status(2));
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));
    await waitFor(() => expectOpensBake());
    expect(service.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' });
    expect(useSnackbarStore.getState().current?.message).toBe('Reminders on.');
  });

  it('a denial still opens the bake (its banner takes over) with no confirmation', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(status(1));
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));
    await waitFor(() => expectOpensBake());
    expect(service.reconcile).not.toHaveBeenCalled();
    expect(useSnackbarStore.getState().current).toBeNull();
  });

  it('on Android with exact alarms denied, a grant continues to PERM-ALARM', async () => {
    Platform.OS = 'android';
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
    service.reconcile.mockImplementationOnce(async () => {
      usePermissions.getState().set({ exactAlarm: 'denied' });
      return {
        status: 'ok',
        scheduled: 0,
        cancelled: 0,
        kept: 0,
        failed: 0,
        trimmed: { critical: 0, other: 0 },
      };
    });
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on reminders' }));
    await waitFor(() =>
      expect(routerSpies.push).toHaveBeenCalledWith(
        `/bake/schedule/permission-alarm?bakeId=${BAKE}`,
      ),
    );
    expect(routerSpies.dismissAll).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the prompt is open', async () => {
    let resolve: (v: never) => void = () => undefined;
    mocked.requestPermissionsAsync.mockReturnValue(new Promise((r) => (resolve = r as never)));
    await renderScreen(<NotificationPrimerScreen bakeId={BAKE} />);
    const button = screen.getByRole('button', { name: 'Turn on reminders' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolve(status(1)));
  });
});

describe('PERM-ALARM', () => {
  it('"Allow on-time reminders" opens the system page, then rebuilds and confirms', async () => {
    Platform.OS = 'android';
    mocked.requestExactAlarmPermissionsAsync.mockResolvedValue({ granted: true } as never);
    mocked.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: true } as never);
    await renderScreen(<AlarmPrimerScreen bakeId={BAKE} />);
    expect(
      screen.getByText(
        'On the next screen, turn on Allow setting alarms and reminders, then come back.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow on-time reminders' }));
    await waitFor(() => expectOpensBake());
    expect(service.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' });
    expect(useSnackbarStore.getState().current?.message).toBe('On-time reminders on.');
    expect(usePermissions.getState().alarmPrimerShownAt).not.toBeNull();
  });

  it('"Not now" records the primer as shown and opens the bake', async () => {
    Platform.OS = 'android';
    await renderScreen(<AlarmPrimerScreen bakeId={BAKE} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expectOpensBake());
    expect(mocked.requestExactAlarmPermissionsAsync).not.toHaveBeenCalled();
    expect(usePermissions.getState().alarmPrimerShownAt).not.toBeNull();
  });
});
