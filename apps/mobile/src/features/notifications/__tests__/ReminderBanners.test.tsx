import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { useSnackbarStore } from '../../../state/snackbar';
import { renderWithTheme } from '../../../ui/testing';
import { ReminderBanners } from '../components/ReminderBanners';
import { setNotificationService } from '../instance';
import type { NotificationService } from '../service';
import { usePermissions } from '../store';

jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const status = (s: number) =>
  ({ granted: s >= 2, canAskAgain: s === 0, ios: { status: s } }) as never;
const ok = {
  status: 'ok',
  scheduled: 0,
  cancelled: 0,
  kept: 0,
  failed: 0,
  trimmed: { critical: 0, other: 0 },
} as const;
const service = {
  reconcile: jest.fn(async () => ok),
  refreshPermissions: jest.fn(async () => undefined),
} as unknown as jest.Mocked<NotificationService>;

let openSettings: jest.SpyInstance;
beforeEach(() => {
  usePermissions.getState().reset();
  setNotificationService(service);
  openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  useSnackbarStore.setState({ current: null });
});
afterEach(() => {
  setNotificationService(null);
  openSettings.mockRestore();
  jest.clearAllMocks();
});

describe('ReminderBanners', () => {
  it('renders nothing while permissions are unknown or granted', async () => {
    await renderWithTheme(<ReminderBanners />);
    expect(screen.queryByTestId('reminder-banners')).toBeNull();
    await act(async () =>
      usePermissions.getState().set({ notifications: 'granted', exactAlarm: 'granted' }),
    );
    expect(screen.queryByTestId('reminder-banners')).toBeNull();
  });

  it('shows the denied banner, and "Turn on" opens system Settings without re-prompting', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(status(1));
    await renderWithTheme(<ReminderBanners />);
    await act(async () => usePermissions.getState().set({ notifications: 'denied' }));
    expect(
      screen.getByText("Reminders are off. You won't be alerted when a step starts."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(openSettings).toHaveBeenCalledTimes(1));
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('shows the same banner when never asked, and "Turn on" shows the system prompt', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(status(0));
    mocked.requestPermissionsAsync.mockResolvedValue(status(2));
    await renderWithTheme(<ReminderBanners />);
    await act(async () => usePermissions.getState().set({ notifications: 'undetermined' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('banner-notifOff')).toBeNull());
    expect(service.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' });
  });

  it('can be dismissed', async () => {
    await renderWithTheme(<ReminderBanners />);
    await act(async () => usePermissions.getState().set({ notifications: 'denied' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss reminders warning' }));
    expect(screen.queryByTestId('banner-notifOff')).toBeNull();
  });

  it('hides the alarm banner while notifications are off, and shows two at most', async () => {
    await renderWithTheme(<ReminderBanners />);
    await act(async () =>
      usePermissions.getState().set({
        notifications: 'denied',
        exactAlarm: 'denied',
        failedCount: 3,
        budgetTrimmed: true,
      }),
    );
    expect(screen.getByTestId('banner-notifOff')).toBeTruthy();
    expect(screen.queryByTestId('banner-alarmOff')).toBeNull();
    await act(async () => usePermissions.getState().set({ notifications: 'granted' }));
    expect(screen.getByTestId('banner-notifFailed')).toBeTruthy();
    expect(screen.getByTestId('banner-alarmOff')).toBeTruthy();
    expect(screen.queryByTestId('banner-budget')).toBeNull();
  });

  it('retries failed reminders, then confirms with a snackbar', async () => {
    await renderWithTheme(<ReminderBanners tier="kitchen" />);
    await act(async () =>
      usePermissions.getState().set({ notifications: 'granted', failedCount: 2 }),
    );
    expect(screen.getByText("Some reminders couldn't be set.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(useSnackbarStore.getState().current?.message).toBe('Reminders set.'),
    );
  });

  it('uses the "still couldn\'t" copy after a failed retry', async () => {
    await renderWithTheme(<ReminderBanners />);
    await act(async () =>
      usePermissions
        .getState()
        .set({ notifications: 'granted', failedCount: 2, failedAttempts: 1 }),
    );
    expect(
      screen.getByText(
        "Reminders still couldn't be set. Restart your phone, then open the app again.",
      ),
    ).toBeTruthy();
  });
});
