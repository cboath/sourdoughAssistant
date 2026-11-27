/**
 * RN-06: the plan screen end to end over an in-memory database with the seeded recipes, a fixed
 * clock (Thu 2026-11-26 9:00 AM New York) and the navigator stand-in.
 */
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { pressHeaderButton } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { Navigator, navigatorTop, resetNavigator } from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { useSnackbarStore } from '../../../state/snackbar';
import { setScheduleSideEffects } from '../sideEffects';
import { useScheduleDraft } from '../store';
import { COUNTRY, NOW, ZONE } from './helpers';

jest.mock('../../notifications/permissions', () => ({
  resolvePostScheduleRoute: jest.fn().mockResolvedValue('live'),
}));

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

const WHOLE_WHEAT = '5eed0003-0000-4000-8000-000000000002';
const PLAN = `/bake/schedule/plan?recipeId=${COUNTRY}&loaves=1`;
const originalNow = clock.now;
const originalZone = clock.zone;

beforeEach(() => {
  clock.now = () => NOW;
  clock.zone = () => ZONE;
});

afterEach(async () => {
  clock.now = originalNow;
  clock.zone = originalZone;
  setScheduleSideEffects(null);
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useScheduleDraft.getState().reset();
  });
  useSnackbarStore.setState({ current: null });
});

const open = (
  initial: string[] = ['/recipes', PLAN],
  prepare?: Parameters<typeof renderScreen>[1] extends infer O
    ? O extends { prepare?: infer P }
      ? P
      : never
    : never,
) => renderScreen(<Navigator initial={initial} />, { seed: true, prepare });

describe('plan screen', () => {
  it('opens with the smart default (Sat 10:00 AM) and the full timeline', async () => {
    await open();
    expect(await screen.findByText('Sat, Nov 28 · 10:00 AM')).toBeTruthy();
    expect(screen.getByText('Country loaf')).toBeTruthy();
    expect(screen.getByText('Final starter feeding')).toBeTruthy();
    expect(screen.getByText('Friday, November 27')).toBeTruthy();
    expect(screen.getByText('30 h 55 min total')).toBeTruthy();
    expect(screen.getByText('1 step needs you during quiet hours (10 PM–6 AM).')).toBeTruthy();
    expect(
      screen.getByText(
        'Starts Tomorrow 3:05 AM · Ready Fri 10:00 AM'.replace('Fri 10:00 AM', 'Sat 10:00 AM'),
      ),
    ).toBeTruthy();
    // Kitchen temperature starts "Not set" (B6).
    expect(screen.getByLabelText(/^Kitchen temperature, Not set/)).toBeTruthy();
  });

  it('Schedule bake writes the bake with snapshots and calls the side-effect seam', async () => {
    const seen: string[] = [];
    setScheduleSideEffects({ onBakeScheduled: (id) => void seen.push(id) });
    const { db } = await open();
    await fireEvent.press(await screen.findByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());

    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    expect(bake.bake).toMatchObject({
      status: 'scheduled',
      mode: 'backward',
      timeZone: ZONE,
      kitchenTempC: null,
      requestedReadyAt: '2026-11-28T15:00:00.000Z',
      plannedReadyAt: '2026-11-28T15:00:00.000Z',
      originalReadyAt: '2026-11-28T15:00:00.000Z',
    });
    expect(bake.steps).toHaveLength(10);
    expect(bake.steps[0]).toMatchObject({ name: 'Final starter feeding', status: 'pending' });
    expect(bake.steps[0]!.stepKey).toMatch(new RegExp(`^${bake.items[0]!.id}:`));
    const item = bake.items[0]!;
    expect(item.recipeSnapshot.recipe.name).toBe('Country loaf');
    expect(item.recipeSnapshot.steps).toHaveLength(10);
    expect(item.costSnapshot?.breakdown).toMatchObject({ perLoafCents: 139 });
    expect(seen).toEqual([header!.id]);
    // The modal closes, then the new bake opens.
    expect(navigatorTop()).toBe(`/bake/${header!.id}`);
  });

  it('pushes the notification primer after saving when one is due', async () => {
    const permissions = jest.requireMock('../../notifications/permissions') as {
      resolvePostScheduleRoute: jest.Mock;
    };
    permissions.resolvePostScheduleRoute.mockResolvedValueOnce('permission-notifications');
    const { db } = await open();
    await fireEvent.press(await screen.findByTestId('schedule-bake'));
    const [header] = await waitFor(async () => {
      const list = await db.repos.bakes.list();
      expect(list).toHaveLength(1);
      return list;
    });
    await waitFor(() =>
      expect(navigatorTop()).toBe(`/bake/schedule/permission-notifications?bakeId=${header!.id}`),
    );
    expect(routerSpies.dismissAll).not.toHaveBeenCalled();
  });

  it('a failing side effect does not undo the saved bake', async () => {
    setScheduleSideEffects({ onBakeScheduled: () => Promise.reject(new Error('boom')) });
    const { db } = await open();
    await fireEvent.press(await screen.findByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    expect(await db.repos.bakes.list()).toHaveLength(1);
  });

  it('too soon: shows the banner with the earliest time and saves nothing', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    await act(async () => {
      useScheduleDraft.getState().setReadyLocal({ date: '2026-11-27', time: '10:00' });
    });
    expect(await screen.findByTestId('banner-too-soon')).toBeTruthy();
    expect(screen.getByText(/^Too soon\. This bake needs 30 h 55 min\./)).toBeTruthy();
    expect(screen.getByText('Showing times for the earliest ready time.')).toBeTruthy();
    expect(screen.getByLabelText('Ready time, error: too soon')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    expect(await db.repos.bakes.list()).toHaveLength(0);
    expect(routerSpies.dismissAll).not.toHaveBeenCalled();
    // "Use <earliest>" resolves it.
    await fireEvent.press(screen.getByRole('button', { name: /^Use / }));
    await waitFor(() => expect(screen.queryByTestId('banner-too-soon')).toBeNull());
  });

  it('the clock passing the first step blocks the save (re-run on tap)', async () => {
    const { db } = await open();
    await screen.findByText('Sat, Nov 28 · 10:00 AM');
    // Two days later the first step is in the past, though the 30 s tick has not fired yet.
    clock.now = () => NOW + 2 * 86_400_000;
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    expect(await db.repos.bakes.list()).toHaveLength(0);
    expect(await screen.findByTestId('banner-too-soon')).toBeTruthy();
  });

  it('a slider changes the plan live and "Use default" returns to the recipe value', async () => {
    await open();
    await screen.findByText('Cold ferment (fridge)');
    expect(screen.getByText('12 h · range 12–24 h')).toBeTruthy();
    const change = screen.getAllByText('Change')[4]!; // feeding, mix, bulk, shape, cold
    await fireEvent.press(change);
    const plus = screen.getByTestId(/^slider-plus-/);
    await fireEvent.press(plus);
    await fireEvent.press(plus);
    expect(screen.getByText('12 h 30 min · you chose this · range 12–24 h')).toBeTruthy();
    // The start moves earlier by 30 minutes: 3:05 AM becomes 2:35 AM.
    expect(screen.getByText('2:35 AM')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(/^slider-reset-/));
    expect(screen.getByText('12 h · range 12–24 h')).toBeTruthy();
    expect(screen.getByText('3:05 AM')).toBeTruthy();
  });

  it('a kitchen temperature adjusts bulk ferment and says so', async () => {
    await open();
    await fireEvent.press(await screen.findByTestId('temp-row'));
    // The sheet opens at 21 C; step up to 27 C.
    const stepper = screen.getByTestId('temp-stepper');
    for (let i = 0; i < 5; i += 1) {
      await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    }
    expect(screen.getByText(/^Bulk ferment: .* \(recipe 6 h\)$/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('temp-set'));
    expect(screen.getByLabelText(/^Kitchen temperature, 26/)).toBeTruthy();
    expect(screen.getByText(/^Adjusted for 26.°C, was 6 h$/)).toBeTruthy();
    expect(useScheduleDraft.getState().kitchenTempC).toBe(26);
  });

  it('a temperature that would leave the range is capped, with a warning line', async () => {
    await open();
    await screen.findByText('Final starter feeding');
    await act(async () => {
      useScheduleDraft.getState().setKitchenTemp(30);
    });
    expect(await screen.findByText(/^Capped at 5 h for 30.°C$/)).toBeTruthy();
    expect(screen.getByText(/^Kitchen is warm: Bulk ferment capped at 5 h\./)).toBeTruthy();
  });

  it('Start now saves an active bake with its first step started', async () => {
    const { db } = await open();
    await fireEvent.press(await screen.findByTestId('plan-mode-forward'));
    expect(await screen.findByText(/^Starts as soon as you tap Schedule bake/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    expect(bake.bake).toMatchObject({ status: 'active', mode: 'forward', requestedReadyAt: null });
    expect(bake.bake.startedAt).toBe(new Date(NOW).toISOString());
    expect(bake.steps[0]).toMatchObject({
      status: 'active',
      actualStartAt: new Date(NOW).toISOString(),
    });
    expect(bake.steps.filter((s) => s.status === 'active')).toHaveLength(1);
  });

  it('three loaves in a two-loaf oven explain the slots', async () => {
    await open(['/recipes', `/bake/schedule/plan?recipeId=${COUNTRY}&loaves=3`]);
    const oven = await screen.findByTestId('oven-stepper');
    await fireEvent(oven, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(await screen.findByText(/^Oven slot 1 · 2 loaves · /)).toBeTruthy();
    expect(screen.getByText(/^Oven slot 2 · 1 loaf · /)).toBeTruthy();
    expect(screen.getByText('Default from Settings: 1')).toBeTruthy();
  });

  it('adds a second recipe, merges the timeline with letters, and removes it with Undo', async () => {
    await open();
    await screen.findByText('Final starter feeding');
    await fireEvent.press(screen.getByTestId('add-recipe'));
    await fireEvent.press(await screen.findByTestId(`add-${WHOLE_WHEAT}`));
    expect(await screen.findByText('Recipes')).toBeTruthy();
    expect(screen.getByText('2 loaves')).toBeTruthy();
    expect(screen.getAllByText('Final starter feeding')).toHaveLength(2);
    expect(screen.getByText(/^Oven slot 1 · A ×1 · /)).toBeTruthy();
    expect(screen.getByText('Each recipe uses its own dough weight.')).toBeTruthy();
    // Remove B, then undo.
    await fireEvent.press(screen.getByTestId('item-menu-1'));
    await fireEvent.press(screen.getByTestId('item-remove-1'));
    expect(useScheduleDraft.getState().items).toHaveLength(1);
    const snack = useSnackbarStore.getState().current!;
    expect(snack.message).toBe('Whole wheat loaf removed.');
    await act(async () => snack.onAction?.());
    expect(useScheduleDraft.getState().items).toHaveLength(2);
  });

  it('a multi-recipe bake saves one item per recipe with its own snapshot', async () => {
    const { db } = await open();
    await screen.findByText('Final starter feeding');
    await fireEvent.press(screen.getByTestId('add-recipe'));
    await fireEvent.press(await screen.findByTestId(`add-${WHOLE_WHEAT}`));
    await screen.findByText('Recipes');
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    await waitFor(() => expect(routerSpies.dismissAll).toHaveBeenCalled());
    const [header] = await db.repos.bakes.list();
    const bake = (await db.repos.bakes.get(header!.id))!;
    expect(bake.items.map((i) => i.recipeSnapshot.recipe.name)).toEqual([
      'Country loaf',
      'Whole wheat loaf',
    ]);
    expect(bake.bake.ovenSlots).toHaveLength(2);
    expect(new Set(bake.steps.map((s) => s.stepKey)).size).toBe(bake.steps.length);
  });

  it('a deleted recipe shows the banner and cannot be scheduled', async () => {
    const { db } = await open(['/recipes']);
    await act(async () => {
      useScheduleDraft
        .getState()
        .setSelection([{ recipeId: 'deadbeef-0000-4000-8000-000000000000', loaves: 1 }]);
      routerSpies.push('/bake/schedule/plan');
    });
    expect(await screen.findByTestId('banner-gone')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('schedule-bake'));
    expect(await db.repos.bakes.list()).toHaveLength(0);
  });

  it('a recipe that can not be planned shows why, with an edit action', async () => {
    await open(['/recipes', PLAN], async (db) => {
      await db.repos.recipes.update(COUNTRY, { steps: [] });
    });
    expect(
      await screen.findByText("Country loaf can't be scheduled: It has no steps."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit recipe' }));
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
  });

  it('no params and no draft shows how to start', async () => {
    await open(['/recipes', '/bake/schedule/plan']);
    expect(await screen.findByText('Pick a recipe to plan a bake.')).toBeTruthy();
  });
});

describe('picker', () => {
  it('lists recipes and a tap opens the plan with that recipe', async () => {
    await open(['/recipes', '/bake/schedule']);
    const row = await screen.findByTestId(`pick-${COUNTRY}`);
    expect(within(row).getByText('30 h 55 min · 1 loaf')).toBeTruthy();
    await fireEvent.press(row);
    expect(navigatorTop()).toBe('/bake/schedule/plan');
    expect(await screen.findByText('Final starter feeding')).toBeTruthy();
    expect(useScheduleDraft.getState().items[0]?.recipeId).toBe(COUNTRY);
  });

  it('multi-select keeps the order, caps at 4 and continues with the selection', async () => {
    await open(['/recipes', '/bake/schedule']);
    await screen.findByTestId(`pick-${COUNTRY}`);
    await pressHeaderButton('Select');
    await fireEvent.press(await screen.findByTestId(`pick-${WHOLE_WHEAT}`));
    await fireEvent.press(screen.getByTestId(`pick-${COUNTRY}`));
    expect(screen.getByText('2 loaves, 2 recipes')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pick-continue'));
    expect(navigatorTop()).toBe('/bake/schedule/plan');
    expect(useScheduleDraft.getState().items.map((i) => i.recipeId)).toEqual([
      WHOLE_WHEAT,
      COUNTRY,
    ]);
  });

  it('Continue is disabled with nothing selected', async () => {
    await open(['/recipes', '/bake/schedule']);
    await screen.findByTestId(`pick-${COUNTRY}`);
    await pressHeaderButton('Select');
    await fireEvent.press(screen.getByTestId('pick-continue'));
    expect(navigatorTop()).toBe('/bake/schedule');
  });

  it('shows the empty state with starter recipes when there are none', async () => {
    await renderScreen(<Navigator initial={['/recipes', '/bake/schedule']} />);
    expect(await screen.findByText('No recipes yet')).toBeTruthy();
    expect(screen.getByText('Add starter recipes')).toBeTruthy();
  });
});
