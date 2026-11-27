/**
 * QA-04: the plan screen, the real `registerNotifications` wiring and a fake OS queue. Tapping
 * "Schedule bake" must end with the right reminders pending, and the 4-recipe cap must hold in the
 * picker and on the plan screen.
 */
import { fromIso } from '@sourdough/core';
import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { pressHeaderButton } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { Navigator, navigatorTop, resetNavigator } from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { recipeInput } from '../../../db/fixtures';
import type { TestDb } from '../../../db/test-utils';
import { clock } from '../../../lib/clock';
import { useSnackbarStore } from '../../../state/snackbar';
import { reconcileNotifications } from '../../notifications/instance';
import { registerNotifications, unregisterNotifications } from '../../notifications/register';
import { usePermissions } from '../../notifications/store';
import type { FakeNotifier } from '../../notifications/__tests__/fixtures';
import { expoNotifier } from '../../notifications/expoNotifier';
import { useSettings } from '../../../state/settings';
import { useScheduleDraft } from '../store';
import { COUNTRY, NOW, ZONE } from './helpers';

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30_000);

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/navigatorState').mockExpoRouterWithNavigator,
);
jest.mock('@shopify/flash-list', () =>
  jest.requireActual('../../../__tests__/helpers/flashListMock'),
);
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('expo-notifications', () =>
  jest
    .requireActual('../../notifications/__tests__/expoNotificationsMock')
    .createExpoNotificationsMock(),
);
// The OS queue is a fake; everything above it (register, service, planner) is real.
jest.mock('../../notifications/expoNotifier', () => ({
  expoNotifier: jest
    .requireActual('../../notifications/__tests__/fixtures')
    .createFakeNotifier('ios'),
}));
jest.mock('../../notifications/permissions', () => ({
  ...jest.requireActual('../../notifications/permissions'),
  resolvePostScheduleRoute: jest.fn().mockResolvedValue('live'),
}));

const fake = expoNotifier as unknown as FakeNotifier;
const WHOLE_WHEAT = '5eed0003-0000-4000-8000-000000000002';
const PLAN = `/bake/schedule/plan?recipeId=${COUNTRY}&loaves=1`;
const originalNow = clock.now;
const originalZone = clock.zone;

beforeEach(() => {
  clock.now = () => NOW;
  clock.zone = () => ZONE;
  fake.store.clear();
  fake.intents.clear();
  fake.permission = 'granted';
  fake.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
  usePermissions.getState().reset();
});

afterEach(async () => {
  unregisterNotifications();
  clock.now = originalNow;
  clock.zone = originalZone;
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useScheduleDraft.getState().reset();
  });
  useSettings.setState({ settings: null });
  useSnackbarStore.setState({ current: null });
});

async function open(initial: string[] = ['/recipes', PLAN], extraRecipes = 0) {
  return renderScreen(<Navigator initial={initial} />, {
    seed: true,
    prepare: async (db: TestDb) => {
      for (let i = 0; i < extraRecipes; i += 1) {
        const base = recipeInput({
          recipe: { name: i === 0 ? 'Rye loaf' : 'Spelt loaf', yieldLoaves: 1, tags: [] },
        });
        // Step ids are global, so each extra recipe gets its own.
        const [bake, preheat] = base.steps;
        await db.repos.recipes.create({
          ...base,
          steps: [
            { ...bake!, id: `extra-${i}-bake` },
            {
              ...preheat!,
              id: `extra-${i}-preheat`,
              anchor: {
                type: 'alongside',
                stepId: `extra-${i}-bake`,
                align: 'endsAtStart',
                offsetMin: 0,
              },
            },
          ],
        });
      }
      registerNotifications(db.repos);
    },
  });
}

const pending = () => fake.ids('sa1:');

describe('plan screen -> Schedule bake -> pending reminders', () => {
  it('pends one start and heads-up per step plus the extra folds, exactly the ids of the saved bake', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    // The 3:05 AM feeding sits inside quiet hours: a warning on screen, not a missing reminder.
    expect(screen.getByText('1 step needs you during quiet hours (10 PM–6 AM).')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    await waitFor(() => expect(pending()).toHaveLength(23));

    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    const expected = new Set<string>();
    for (const step of bake.steps) {
      expected.add(`sa1:${bake.bake.id}:${step.stepKey}:start`);
      expected.add(`sa1:${bake.bake.id}:${step.stepKey}:headsup`);
    }
    const folds = bake.steps.find((s) => s.name === 'Stretch and folds')!;
    for (const n of [2, 3, 4]) expected.add(`sa1:${bake.bake.id}:${folds.stepKey}:fold:${n}`);
    expect(pending()).toEqual([...expected].sort());

    const feed = bake.steps.find((s) => s.name === 'Final starter feeding')!;
    const start = fake.intents.get(`sa1:${bake.bake.id}:${feed.stepKey}:start`)!;
    expect(start.fireAtMs).toBe(fromIso(feed.plannedStartAt));
    expect(start.interruptionLevel).toBe('timeSensitive');
    expect(start.data.bakeStepId).toBe(feed.id);
    // The default heads-up lead is stored on the bake and used by the planner.
    const headsUp = fake.intents.get(`sa1:${bake.bake.id}:${feed.stepKey}:headsup`)!;
    expect(fromIso(feed.plannedStartAt) - headsUp.fireAtMs).toBe(bake.bake.headsUpMin * 60_000);
  });

  it('Start now: the first step is already running, so its own start and heads-up are not scheduled', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    await fireEvent.press(screen.getByRole('radio', { name: 'Start now' }));
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    expect(bake.bake.status).toBe('active');
    const first = bake.steps.find((s) => s.status === 'active')!;
    await waitFor(() => expect(pending().length).toBeGreaterThan(10));
    expect(pending().some((id) => id.includes(`:${first.stepKey}:start`))).toBe(false);
    expect(pending().some((id) => id.includes(`:${first.stepKey}:headsup`))).toBe(false);
    // The next step's reminder exists.
    const next = bake.steps.find((s) => s.position > first.position && !s.isAlongside)!;
    expect(pending()).toContain(`sa1:${bake.bake.id}:${next.stepKey}:start`);
  });

  it('notifications denied: the bake is saved and the schedule works; granting later schedules everything', async () => {
    fake.permission = 'denied';
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    expect(await db.repos.bakes.list()).toHaveLength(1);
    expect(pending()).toEqual([]);
    expect(fake.calls.schedule).toBe(0);
    await waitFor(() => expect(usePermissions.getState().notifications).toBe('denied'));

    fake.permission = 'granted';
    await act(async () => {
      await reconcileNotifications({ mode: 'rebuild' });
    });
    expect(pending()).toHaveLength(23);
    expect(usePermissions.getState().notifications).toBe('granted');
  });

  it('a failing OS call never undoes the saved bake and is retried by the next reconcile', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    const original = fake.schedule.bind(fake);
    let failing = true;
    fake.schedule = async (intent) => {
      if (failing && intent.kind === 'headsup') throw new Error('os says no');
      return original(intent);
    };
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    await waitFor(() => expect(usePermissions.getState().failedCount).toBeGreaterThan(0));
    expect(await db.repos.bakes.list()).toHaveLength(1);
    expect(pending().length).toBeLessThan(23);
    failing = false;
    await act(async () => {
      await reconcileNotifications({ mode: 'diff' });
    });
    expect(pending()).toHaveLength(23);
    expect(usePermissions.getState().failedCount).toBe(0);
    fake.schedule = original;
  });
});

describe('quiet hours warn on the plan and never change the reminders (ADR 0010 section 5)', () => {
  // The first feeding is Fri 3:05 AM. The window is start inclusive, end exclusive.
  it.each([
    ['off', { quietHoursEnabled: false, quietStartMin: 22 * 60, quietEndMin: 6 * 60 }, false],
    [
      'ends exactly at 3:05 (exclusive)',
      { quietHoursEnabled: true, quietStartMin: 180, quietEndMin: 185 },
      false,
    ],
    ['ends at 3:06', { quietHoursEnabled: true, quietStartMin: 180, quietEndMin: 186 }, true],
    [
      'starts exactly at 3:05 (inclusive)',
      { quietHoursEnabled: true, quietStartMin: 185, quietEndMin: 186 },
      true,
    ],
    [
      'start equals end is an empty window',
      { quietHoursEnabled: true, quietStartMin: 180, quietEndMin: 180 },
      false,
    ],
  ])('%s', async (_name, settings, warns) => {
    useSettings.setState({ settings: settings as never });
    await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    expect(!!screen.queryByText(/needs? you during quiet hours/)).toBe(warns);
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    await waitFor(() => expect(pending()).toHaveLength(23));
    const feed = [...fake.intents.values()].find(
      (i) => i.fireAtMs === NOW + 18 * 3_600_000 + 5 * 60_000,
    );
    expect(feed?.interruptionLevel).toBe('timeSensitive');
  });

  it('a double tap on Schedule bake saves one bake and pends one set of reminders', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    const button = screen.getByTestId('schedule-bake');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    await waitFor(() => expect(pending()).toHaveLength(23));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await db.repos.bakes.list()).toHaveLength(1);
    expect(pending()).toHaveLength(23);
  });
});

describe('the 4-recipe cap (B7, ADR 0009)', () => {
  it('picker: a fifth recipe is refused with the limit message and the selection stays at four', async () => {
    await open(['/recipes', '/bake/schedule'], 2);
    await screen.findByTestId(`pick-${COUNTRY}`);
    await pressHeaderButton('Select');
    const rows = screen.getAllByTestId(/^pick-(?!loaves|continue)/);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const ids = rows.map((r) => String(r.props.testID).replace('pick-', ''));
    for (const id of ids.slice(0, 4)) await fireEvent.press(screen.getByTestId(`pick-${id}`));
    expect(screen.getByText(/4 recipes$/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`pick-${ids[4]}`));
    expect(useSnackbarStore.getState().current?.message).toBe(
      'You can bake up to 4 recipes together.',
    );
    expect(screen.getByText(/4 recipes$/)).toBeTruthy();
    // Deselecting one makes room again.
    await fireEvent.press(screen.getByTestId(`pick-${ids[0]}`));
    await fireEvent.press(screen.getByTestId(`pick-${ids[4]}`));
    expect(screen.getByText(/4 recipes$/)).toBeTruthy();
  });

  it('plan screen: four recipes hide "Add recipe"; scheduling pends letters A to D and stays within 60', async () => {
    const { db } = await open(['/recipes', '/bake/schedule'], 2);
    await screen.findByTestId(`pick-${COUNTRY}`);
    await pressHeaderButton('Select');
    const ids = screen
      .getAllByTestId(/^pick-(?!loaves|continue)/)
      .map((r) => String(r.props.testID).replace('pick-', ''))
      .slice(0, 4);
    for (const id of ids) await fireEvent.press(screen.getByTestId(`pick-${id}`));
    await fireEvent.press(screen.getByTestId('pick-continue'));
    expect(navigatorTop()).toBe('/bake/schedule/plan');
    await screen.findByText('Recipes');
    expect(useScheduleDraft.getState().items).toHaveLength(4);
    expect(screen.queryByTestId('add-recipe')).toBeNull();

    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    expect(bake.items).toHaveLength(4);
    expect(new Set(bake.steps.map((s) => s.stepKey)).size).toBe(bake.steps.length);
    await waitFor(() => expect(pending().length).toBeGreaterThan(20));
    expect(pending().length).toBeLessThanOrEqual(60);
    const text = pending().map(
      (id) => `${fake.intents.get(id)!.title} ${fake.intents.get(id)!.body}`,
    );
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(text.some((t) => new RegExp(`\\b${letter}\\b`).test(t))).toBe(true);
    }
    expect(text.some((t) => /\bE\b/.test(t))).toBe(false);
  });

  it('the draft store drops any fifth recipe whatever route put it there', async () => {
    await open();
    await screen.findByText('Final starter feeding');
    await act(async () => {
      useScheduleDraft.getState().setSelection(
        ['a', 'b', 'c', 'd', 'e'].map((_, i) => ({
          recipeId: [COUNTRY, WHOLE_WHEAT, COUNTRY, WHOLE_WHEAT, COUNTRY][i]!,
          loaves: 1,
        })),
      );
    });
    expect(useScheduleDraft.getState().items).toHaveLength(4);
  });
});
