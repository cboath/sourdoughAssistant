/**
 * QA-04: a notification tap end to end on the JS side. The payload is the one the real planner put
 * in the fake OS queue; the tap hook turns it into a route; the real route file validates the params
 * and opens the live screen on that step. T-LIFE-3 and T-LIFE-4 still need a device for the OS half.
 */
import { fromIso } from '@sourdough/core';
import { configure, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as ReactNative from 'react-native';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { useLiveUi } from '../../live/store';
import { createBakeService } from '../../schedule/services/bakeService';
import {
  NOW,
  ZONE,
  at,
  makeBake,
  seededDb,
  startAt,
  stepByName,
} from '../../live/__tests__/helpers';
import { expoNotifier } from '../expoNotifier';
import { useNotificationTaps } from '../hooks/useNotificationTaps';
import { reconcileNotifications } from '../instance';
import { registerNotifications, unregisterNotifications } from '../register';
import { usePermissions } from '../store';
import type { FakeNotifier } from './fixtures';
import BakeLive from '../../../../app/bake/[id]/index';
import { act } from '@testing-library/react-native';

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30_000);

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('@shopify/flash-list', () =>
  jest.requireActual('../../../__tests__/helpers/flashListMock'),
);
jest.mock('../components/ReminderBanners', () => ({ ReminderBanners: () => null }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-notifications', () =>
  jest.requireActual('./expoNotificationsMock').createExpoNotificationsMock(),
);
jest.mock('../expoNotifier', () => ({
  expoNotifier: jest.requireActual('./fixtures').createFakeNotifier('ios'),
}));

const fake = expoNotifier as unknown as FakeNotifier;
const mocked = Notifications as unknown as jest.Mocked<typeof Notifications>;
const originalNow = clock.now;
const originalZone = clock.zone;
const time = { now: NOW };

const response = (data: unknown, id = 'n1', action = Notifications.DEFAULT_ACTION_IDENTIFIER) =>
  ({
    actionIdentifier: action,
    notification: { date: 1, request: { identifier: id, content: { data } } },
  }) as never;

function Host() {
  useNotificationTaps();
  return null;
}

beforeEach(() => {
  time.now = NOW;
  clock.now = () => time.now;
  clock.zone = () => ZONE;
  fake.store.clear();
  fake.intents.clear();
  fake.permission = 'granted';
  usePermissions.getState().reset();
  jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});
afterEach(() => {
  unregisterNotifications();
  clock.now = originalNow;
  clock.zone = originalZone;
  clearClients();
  routerSpies.reset();
  useLiveUi.getState().reset();
  mocked.useLastNotificationResponse.mockReturnValue(undefined);
  jest.restoreAllMocks();
});

/** A bake in its Bulk ferment at 5 PM Friday with the reminders the planner scheduled for it. */
async function runningBake() {
  const db = await seededDb();
  registerNotifications(db.repos);
  let bake = await makeBake(db, { service: createBakeService(db.repos, () => undefined) });
  bake = await startAt(db, bake, 'Bulk ferment');
  time.now = at('2026-11-27', '17:00');
  await act(async () => {
    await reconcileNotifications({ mode: 'diff' });
  });
  return { db, bake };
}

/** What the root layout does with a tapped route, then what the route file renders for it. */
async function tapAndOpen(db: Awaited<ReturnType<typeof seededDb>>, data: unknown) {
  mocked.useLastNotificationResponse.mockReturnValue(response(data));
  const host = await render(<Host />);
  const target = routerSpies.push.mock.calls[0]?.[0] as string | undefined;
  expect(target).toBeDefined();
  const [path, query = ''] = target!.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  routerSpies.params = { id: path!.split('/')[2], ...params };
  const view = await renderScreen(<BakeLive />, { db });
  return { target: target!, host, view };
}

const rowBackground = (id: string) => {
  const style = ReactNative.StyleSheet.flatten(screen.getByTestId(`coming-${id}`).props.style);
  return style.backgroundColor as string;
};

describe('tap -> /bake/<id>?step=<id> -> the live screen on that step', () => {
  it('a start reminder for a later step opens the bake with that step highlighted in the list', async () => {
    const { db, bake } = await runningBake();
    const cool = stepByName(bake, 'Cool');
    const id = `sa1:${bake.bake.id}:${cool.stepKey}:start`;
    const { target } = await tapAndOpen(db, fake.intents.get(id)!.data);
    expect(target).toBe(`/bake/${bake.bake.id}?step=${cool.id}`);
    expect(await screen.findByTestId(`coming-${cool.id}`)).toBeTruthy();
    expect(rowBackground(cool.id)).not.toBe('transparent');
    // Another row in the list is not highlighted.
    const shape = stepByName(bake, 'Shape');
    expect(rowBackground(shape.id)).toBe('transparent');
    // Opening from a tap never writes: the step is still pending.
    expect(stepByName((await db.repos.bakes.get(bake.bake.id))!, 'Cool').status).toBe('pending');
  });

  it('a heads-up payload points at the step it warns about', async () => {
    const { db, bake } = await runningBake();
    const cool = stepByName(bake, 'Cool');
    const data = fake.intents.get(`sa1:${bake.bake.id}:${cool.stepKey}:headsup`)!.data;
    expect(data.kind).toBe('headsup');
    const { target } = await tapAndOpen(db, data);
    expect(target).toBe(`/bake/${bake.bake.id}?step=${cool.id}`);
    expect(await screen.findByTestId(`coming-${cool.id}`)).toBeTruthy();
  });

  it('a fold reminder opens the folds step, which is the running one (panel, no list row needed)', async () => {
    const db = await seededDb();
    registerNotifications(db.repos);
    let bake = await makeBake(db, { service: createBakeService(db.repos, () => undefined) });
    bake = await startAt(db, bake, 'Stretch and folds');
    time.now = fromIso(stepByName(bake, 'Stretch and folds').plannedStartAt) + 40 * 60_000;
    await act(async () => {
      await reconcileNotifications({ mode: 'diff' });
    });
    const folds = stepByName(bake, 'Stretch and folds');
    const data = fake.intents.get(`sa1:${bake.bake.id}:${folds.stepKey}:fold:3`)!.data;
    expect(data).toMatchObject({ kind: 'fold', foldIndex: 3 });
    const { target } = await tapAndOpen(db, data);
    expect(target).toBe(`/bake/${bake.bake.id}?step=${folds.id}`);
    expect(await screen.findByText('Stretch and folds')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fold \d of 4 done/ })).toBeTruthy();
  });

  it('warm start: a tap that arrives after the app is up routes once, not on every re-render', async () => {
    const { bake } = await runningBake();
    const cool = stepByName(bake, 'Cool');
    const data = fake.intents.get(`sa1:${bake.bake.id}:${cool.stepKey}:start`)!.data;
    const host = await render(<Host />);
    expect(routerSpies.push).not.toHaveBeenCalled();
    mocked.useLastNotificationResponse.mockReturnValue(response(data, 'warm-1'));
    await host.rerender(<Host />);
    await host.rerender(<Host />);
    expect(routerSpies.push).toHaveBeenCalledTimes(1);
    // A second notification is a second tap.
    mocked.useLastNotificationResponse.mockReturnValue(response(data, 'warm-2'));
    await host.rerender(<Host />);
    expect(routerSpies.push).toHaveBeenCalledTimes(2);
  });

  it('a stale notification for a deleted or unknown bake lands on a not-found state, never a crash', async () => {
    const { db, bake } = await runningBake();
    const cool = stepByName(bake, 'Cool');
    const data = {
      ...fake.intents.get(`sa1:${bake.bake.id}:${cool.stepKey}:start`)!.data,
      bakeId: '00000000-0000-4000-8000-00000000ffff',
    };
    await tapAndOpen(db, data);
    expect(await screen.findByTestId('live-gone')).toBeTruthy();
    expect(screen.getByText("This bake isn't here anymore.")).toBeTruthy();
  });

  it('a step id that is no longer in the bake still opens the bake without a highlight', async () => {
    const { db, bake } = await runningBake();
    const cool = stepByName(bake, 'Cool');
    const data = {
      ...fake.intents.get(`sa1:${bake.bake.id}:${cool.stepKey}:start`)!.data,
      bakeStepId: '00000000-0000-4000-8000-00000000ffff',
    };
    await tapAndOpen(db, data);
    expect(await screen.findByText('Bulk ferment')).toBeTruthy();
    expect(screen.queryByTestId(`coming-${cool.id}`)).toBeNull();
  });

  it('a tampered payload opens the home tab and never a bake route', async () => {
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'start', bakeId: '../../settings/backup', bakeStepId: 'x' }),
    );
    await render(<Host />);
    expect(routerSpies.push).not.toHaveBeenCalled();
    expect(routerSpies.navigate).toHaveBeenCalledWith('/');
  });

  it('the top-up sentinel opens the home tab (it names no bake)', async () => {
    const db = await seededDb();
    registerNotifications(db.repos);
    mocked.useLastNotificationResponse.mockReturnValue(
      response({ v: 1, kind: 'topup', fireAt: new Date(NOW).toISOString(), hash: 'abc' }),
    );
    await render(<Host />);
    expect(routerSpies.navigate).toHaveBeenCalledWith('/');
    expect(routerSpies.push).not.toHaveBeenCalled();
  });
});
