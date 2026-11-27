import { render } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { useNotificationTaps } from '../hooks/useNotificationTaps';

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);

const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const BAKE = '00000000-0000-4000-8000-000000000001';
const STEP = '00000000-0000-4000-8000-000000000002';

function Host() {
  useNotificationTaps();
  return null;
}
const response = (data: unknown, action = Notifications.DEFAULT_ACTION_IDENTIFIER, id = 'n1') =>
  ({
    actionIdentifier: action,
    notification: { date: 1, request: { identifier: id, content: { data } } },
  }) as never;

afterEach(() => {
  routerSpies.reset();
  jest.clearAllMocks();
});

describe('useNotificationTaps', () => {
  it('opens the bake at the step for a valid payload', async () => {
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'start', bakeId: BAKE, bakeStepId: STEP }),
    );
    await render(<Host />);
    expect(routerSpies.push).toHaveBeenCalledWith(`/bake/${BAKE}?step=${STEP}`);
  });

  it('replaces instead of stacking when that bake is already open', async () => {
    routerSpies.pathname = `/bake/${BAKE}`;
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'start', bakeId: BAKE, bakeStepId: STEP }),
    );
    await render(<Host />);
    expect(routerSpies.push).not.toHaveBeenCalled();
    expect(routerSpies.replace).toHaveBeenCalledWith(`/bake/${BAKE}?step=${STEP}`);
  });

  it('handles each tap once even though the hook keeps returning it', async () => {
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'start', bakeId: BAKE, bakeStepId: STEP }),
    );
    const view = await render(<Host />);
    await view.rerender(<Host />);
    expect(routerSpies.push).toHaveBeenCalledTimes(1);
  });

  it('opens / for a malformed payload and never pushes it as a path', async () => {
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'start', bakeId: '../settings/backup', bakeStepId: STEP }),
    );
    await render(<Host />);
    expect(routerSpies.push).not.toHaveBeenCalled();
    expect(routerSpies.navigate).toHaveBeenCalledWith('/');
  });

  it('opens / for the test reminder and ignores non-default actions and no response', async () => {
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'test' }, 'other', 'n2'),
    );
    await render(<Host />);
    expect(routerSpies.navigate).not.toHaveBeenCalled();
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'test' }, undefined, 'n3'),
    );
    await render(<Host />);
    expect(routerSpies.navigate).toHaveBeenCalledWith('/');
    mocked.useLastNotificationResponse.mockReturnValue(undefined);
    await render(<Host />);
    expect(routerSpies.push).not.toHaveBeenCalled();
  });
});
