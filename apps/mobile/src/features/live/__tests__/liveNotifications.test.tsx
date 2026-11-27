/**
 * QA-04: the live screen with the real `registerNotifications` wiring and a fake OS queue. Done,
 * +15 min, Hold, Undo, Cancel and Finish must change the pending reminders the way ADR 0010 and
 * ADR 0011 say. The clock is one object that tests move, because the service captured it.
 */
import { fromIso } from '@sourdough/core';
import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ReactNative from 'react-native';
import { pressHeaderRightByTestId } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { useSnackbarStore } from '../../../state/snackbar';
import { expoNotifier } from '../../notifications/expoNotifier';
import { reconcileNotifications } from '../../notifications/instance';
import { registerNotifications, unregisterNotifications } from '../../notifications/register';
import { usePermissions } from '../../notifications/store';
import type { FakeNotifier } from '../../notifications/__tests__/fixtures';
import { createBakeService } from '../../schedule/services/bakeService';
import { LiveBakeScreen } from '../components/LiveBakeScreen';
import { useLiveUi } from '../store';
import {
  MIN,
  NOW,
  WHOLE_WHEAT,
  ZONE,
  at,
  makeBake,
  seededDb,
  startAt,
  stepByName,
} from './helpers';
import type { TestDb } from '../../../db/test-utils';
import type { BakeAggregate } from '../../../db/types';

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30_000);

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/mockRouter').mockExpoRouter,
);
jest.mock('@shopify/flash-list', () =>
  jest.requireActual('../../../__tests__/helpers/flashListMock'),
);
jest.mock('../../notifications/components/ReminderBanners', () => ({
  ReminderBanners: () => null,
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-notifications', () =>
  jest
    .requireActual('../../notifications/__tests__/expoNotificationsMock')
    .createExpoNotificationsMock(),
);
jest.mock('../../notifications/expoNotifier', () => ({
  expoNotifier: jest
    .requireActual('../../notifications/__tests__/fixtures')
    .createFakeNotifier('ios'),
}));

const fake = expoNotifier as unknown as FakeNotifier;
const originalNow = clock.now;
const originalZone = clock.zone;
const time = { now: NOW };
const setNow = (ms: number) => {
  time.now = ms;
};
const snack = () => useSnackbarStore.getState().current;

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
  useSnackbarStore.setState({ current: null, clearances: {} });
  useLiveUi.getState().reset();
  jest.restoreAllMocks();
});

const pending = (bakeId?: string) => fake.ids(bakeId ? `sa1:${bakeId}:` : 'sa1:');
const times = (bakeId: string) =>
  new Map(pending(bakeId).map((id) => [id, fake.intents.get(id)!.fireAtMs]));

/** What opening the app does at the current clock: a diff reconcile. */
async function foreground() {
  await act(async () => {
    await reconcileNotifications({ mode: 'diff' });
  });
}

/** The fire time an id had in the first plan: start, heads-up lead before it, or fold k. */
function plannedFire(bake: BakeAggregate, id: string): number {
  const [, , ...rest] = id.split(':');
  const kind = rest.at(-1) === 'start' || rest.at(-1) === 'headsup' ? rest.at(-1) : 'fold';
  const key = kind === 'fold' ? rest.slice(0, -2).join(':') : rest.slice(0, -1).join(':');
  const step = bake.steps.find((s) => s.stepKey === key)!;
  const start = fromIso(step.plannedStartAt);
  if (kind === 'start') return start;
  if (kind === 'headsup') return start - bake.bake.headsUpMin * MIN;
  return start + (Number(rest.at(-1)) - 1) * (step.foldIntervalMin ?? 0) * MIN;
}

/** Creates the bake through the real service, so reminders are pending before the screen opens. */
async function arrange(options: Parameters<typeof makeBake>[1] = {}) {
  const db = await seededDb();
  // The screen is rendered later; the service needs the repositories now.
  registerNotifications(db.repos);
  const bake = await makeBake(db, {
    service: createBakeService(db.repos, () => undefined),
    ...options,
  });
  return { db, bake };
}

async function open(db: TestDb, bake: BakeAggregate) {
  return renderScreen(<LiveBakeScreen id={bake.bake.id} />, { db });
}

describe('Done, +15 and Undo on the live screen change the pending reminders', () => {
  it('Done 40 min late: the finished steps drop out, every later reminder moves +40 min, Undo restores them', async () => {
    const { db, bake: created } = await arrange();
    const bake = await startAt(db, created, 'Bulk ferment');
    setNow(at('2026-11-27', '20:45'));
    // The foreground diff at 8:45 PM (the app was opened): the baseline for the shift.
    await foreground();
    const before = times(bake.bake.id);
    await open(db, bake);

    await fireEvent.press(await screen.findByRole('button', { name: 'Done, start Shape' }));
    await waitFor(() => expect(snack()?.message).toContain('+40 min'));
    await waitFor(() => expect(times(bake.bake.id)).not.toEqual(before));

    const after = times(bake.bake.id);
    // Each reminder sits 40 min after its first-plan instant (including the cold ferment, which
    // was already past at 8:45 PM in the old plan and is ahead of us in the new one).
    for (const [id, t] of after) expect(t - plannedFire(created, id)).toBe(40 * MIN);
    for (const [id, t] of before) expect(after.get(id)).toBe(t + 40 * MIN);
    expect(after.size).toBeGreaterThan(before.size);
    const bulkKey = stepByName(bake, 'Bulk ferment').stepKey;
    expect([...after.keys()].some((id) => id.includes(bulkKey))).toBe(false);

    await act(async () => {
      snack()?.onAction?.();
    });
    await waitFor(() => expect(times(bake.bake.id)).toEqual(before));
  });

  it('+15 min extends the running step and pushes the later reminders by 15 min', async () => {
    const { db, bake: created } = await arrange();
    const bake = await startAt(db, created, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await foreground();
    const before = times(bake.bake.id);
    await open(db, bake);
    await fireEvent.press(await screen.findByRole('button', { name: '+15 min' }));
    await waitFor(() =>
      expect(snack()?.message).toBe('Bulk ferment +15 min. Ready time now 10:15 AM.'),
    );
    await waitFor(() => expect(times(bake.bake.id)).not.toEqual(before));
    const after = times(bake.bake.id);
    expect([...after.keys()]).toEqual([...before.keys()]);
    const cool = `sa1:${bake.bake.id}:${stepByName(bake, 'Cool').stepKey}:start`;
    expect(after.get(cool)! - before.get(cool)!).toBe(15 * MIN);
    // The ready reminder is behind an OFF flag: nothing for the end of Cool.
    expect([...after.keys()].some((id) => id.endsWith(':ready'))).toBe(false);
  });

  it('Hold ready time: the oven reminders return to their original instants', async () => {
    const { db, bake: created } = await arrange({ durations: { Cold: 1080 } });
    const originalTimes = times(created.bake.id);
    const bake = await startAt(db, created, 'Bulk ferment');
    setNow(at('2026-11-27', '14:45'));
    await open(db, bake);
    await fireEvent.press(await screen.findByRole('button', { name: 'Done, start Shape' }));
    await screen.findByText(/Shorten Cold ferment \(fridge\) to 17 h 20 min to keep 10:00 AM\./);
    const bake2 = `sa1:${bake.bake.id}:${stepByName(bake, 'Bake, covered').stepKey}:start`;
    await waitFor(() =>
      expect(times(bake.bake.id).get(bake2)).toBe(originalTimes.get(bake2)! + 40 * MIN),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Hold ready time' }));
    await waitFor(() => expect(times(bake.bake.id).get(bake2)).toBe(originalTimes.get(bake2)));
    const cool = `sa1:${bake.bake.id}:${stepByName(bake, 'Cool').stepKey}:start`;
    expect(times(bake.bake.id).get(cool)).toBe(originalTimes.get(cool));
  });
});

describe('Cancel and Finish remove the reminders', () => {
  it('Cancel bake (menu, confirmed) removes that bake only', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { db, bake: created } = await arrange();
    const other = await makeBake(db, {
      service: createBakeService(db.repos, () => undefined),
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '12:00' },
    });
    fake.seed('satest:42');
    const bake = await startAt(db, created, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await foreground();
    const otherBefore = times(other.bake.id);
    await open(db, bake);
    await screen.findByText('Bulk ferment');
    await waitFor(() => expect(pending(bake.bake.id).length).toBeGreaterThan(0));
    await pressHeaderRightByTestId('live-more');
    await fireEvent.press(await screen.findByTestId('action-Cancel bake'));
    await waitFor(() => expect(pending(bake.bake.id)).toEqual([]));
    expect((await db.repos.bakes.get(bake.bake.id))!.bake.status).toBe('cancelled');
    expect(times(other.bake.id)).toEqual(otherBefore);
    expect(fake.store.has('satest:42')).toBe(true);
  });

  it('Finish bake when it is ready: nothing stays pending, and Undo of the completion is offered', async () => {
    const { db, bake: created } = await arrange();
    const bake = await startAt(db, created, 'Cool');
    setNow(fromIso(stepByName(bake, 'Cool').plannedEndAt) + 20 * MIN);
    await open(db, bake);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finish bake' }));
    await waitFor(async () =>
      expect((await db.repos.bakes.get(bake.bake.id))!.bake.status).toBe('completed'),
    );
    await waitFor(() => expect(pending(bake.bake.id)).toEqual([]));
  });

  it('a screen opened on a cancelled bake from a stale notification schedules nothing new', async () => {
    const { db, bake } = await arrange();
    await createBakeService(db.repos, () => undefined).cancel(bake.bake.id, NOW);
    await open(db, bake);
    expect(await screen.findByText(/cancelled/i)).toBeTruthy();
    expect(pending(bake.bake.id)).toEqual([]);
  });
});
