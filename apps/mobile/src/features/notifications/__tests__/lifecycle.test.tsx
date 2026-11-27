import { act, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import type { Repositories } from '../../../db/repositories';
import { clock } from '../../../lib/clock';
import { useNotificationLifecycle } from '../hooks/useNotificationLifecycle';
import { usePermissions } from '../store';

jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);
const mockService = {
  reconcile: jest.fn(async () => undefined),
  refreshPermissions: jest.fn(async () => undefined),
};
jest.mock('../register', () => ({
  registerNotifications: jest.fn(() => mockService),
  unregisterNotifications: jest.fn(),
}));
jest.mock('../channels', () => ({ ensureChannels: jest.fn(async () => undefined) }));

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const meta = {
  get: jest.fn(async () => null as string | null),
  set: jest.fn(async () => undefined),
};
const repos = { meta } as unknown as Repositories;

function Host() {
  useNotificationLifecycle(repos);
  return null;
}

let onChange: (status: string) => void = () => undefined;
const originalZone = clock.zone;
beforeEach(() => {
  usePermissions.getState().reset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _: string,
    cb: (s: string) => void,
  ) => {
    onChange = cb;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => {
  clock.zone = originalZone;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('useNotificationLifecycle', () => {
  it('installs the foreground handler and rebuilds once after the first frame', async () => {
    await render(<Host />);
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' }));
    await waitFor(() => expect(meta.set).toHaveBeenCalledWith('lastTimeZone', clock.zone()));
  });

  it('runs a diff when the app returns to the foreground', async () => {
    await render(<Host />);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledTimes(1));
    mockService.reconcile.mockClear();
    await act(async () => onChange('active'));
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledWith({ mode: 'diff' }));
    expect(mockService.refreshPermissions).toHaveBeenCalled();
  });

  it('rebuilds when permission was just granted in Settings', async () => {
    usePermissions.getState().set({ notifications: 'denied' });
    await render(<Host />);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledTimes(1));
    mockService.reconcile.mockClear();
    mockService.refreshPermissions.mockImplementationOnce(async () => {
      usePermissions.getState().set({ notifications: 'granted' });
    });
    await act(async () => onChange('active'));
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' }));
  });

  it('rebuilds when the time zone changed while backgrounded', async () => {
    clock.zone = () => 'America/New_York';
    await render(<Host />);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledTimes(1));
    mockService.reconcile.mockClear();
    clock.zone = () => 'Europe/London';
    await act(async () => onChange('active'));
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledWith({ mode: 'rebuild' }));
    expect(meta.set).toHaveBeenCalledWith('lastTimeZone', 'Europe/London');
  });

  it('tops up with a diff when a notification arrives in the foreground', async () => {
    await render(<Host />);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledTimes(1));
    mockService.reconcile.mockClear();
    const listener = mocked.addNotificationReceivedListener.mock.calls[0]![0] as () => void;
    listener();
    expect(mockService.reconcile).toHaveBeenCalledWith({ mode: 'diff' });
  });

  it('ignores background and inactive transitions', async () => {
    await render(<Host />);
    await waitFor(() => expect(mockService.reconcile).toHaveBeenCalledTimes(1));
    mockService.reconcile.mockClear();
    await act(async () => onChange('background'));
    expect(mockService.reconcile).not.toHaveBeenCalled();
  });
});
