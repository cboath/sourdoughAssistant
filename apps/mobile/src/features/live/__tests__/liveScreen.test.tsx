/**
 * RN-08: the live bake screen over an in-memory database with the seeded country loaf and a fixed
 * New York clock. Each test sets the clock to one moment of the bake.
 */
import { fromIso } from '@sourdough/core';
import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ReactNative from 'react-native';
import { pressHeaderRightByTestId } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { useSettings } from '../../../state/settings';
import { useSnackbarStore } from '../../../state/snackbar';
import { LiveBakeScreen } from '../components/LiveBakeScreen';
import { setLiveSideEffects } from '../sideEffects';
import { useLiveUi } from '../store';
import {
  COUNTRY,
  NOW,
  WHOLE_WHEAT,
  ZONE,
  at,
  makeBake,
  plannedEnd,
  plannedStart,
  seededDb,
  startAt,
  stepByName,
} from './helpers';
import { createBakeService } from '../../schedule/services/bakeService';

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

const keepAwake = jest.requireMock('expo-keep-awake') as {
  activateKeepAwakeAsync: jest.Mock;
  deactivateKeepAwake: jest.Mock;
};
const originalNow = clock.now;
const originalZone = clock.zone;
const setNow = (ms: number) => {
  clock.now = () => ms;
};

beforeEach(() => {
  clock.zone = () => ZONE;
  setNow(NOW);
  jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});

afterEach(() => {
  clock.now = originalNow;
  clock.zone = originalZone;
  setLiveSideEffects(null);
  clearClients();
  routerSpies.reset();
  useSnackbarStore.setState({ current: null, clearances: {} });
  useLiveUi.getState().reset();
  keepAwake.activateKeepAwakeAsync.mockClear();
  keepAwake.deactivateKeepAwake.mockClear();
  jest.restoreAllMocks();
});

async function open(
  bake: Awaited<ReturnType<typeof makeBake>>,
  db: Awaited<ReturnType<typeof seededDb>>,
  step?: string,
) {
  return renderScreen(<LiveBakeScreen id={bake.bake.id} step={step} />, { db });
}

const snack = () => useSnackbarStore.getState().current;

describe('running', () => {
  it('shows the step, the countdown to its end, what comes next and one big Done', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);

    expect(await screen.findByText('Bulk ferment')).toBeTruthy();
    expect(screen.getByText('Step 4 of 9')).toBeTruthy();
    expect(screen.getByTestId(`countdown-${bake.items[0]!.id}`)).toHaveTextContent('3 h 5 min');
    expect(screen.getByText('until Shape · 8:05 PM')).toBeTruthy();
    const hero = screen.getByRole('button', { name: 'Done, start Shape' });
    expect(hero).toBeTruthy();
    // The panel is one element with a spoken label.
    expect(
      screen.getByLabelText(
        'Now: Bulk ferment, step 4 of 9. 3 hours 5 minutes left, until Shape · 8:05 PM',
      ),
    ).toBeTruthy();
  });

  it('Done writes the step, shows the shift and offers Undo', async () => {
    const seen: string[] = [];
    setLiveSideEffects({
      onBakeProgressChanged: (id, reason) => void seen.push(`${id}:${reason}`),
    });
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    seen.length = 0;
    // 40 minutes late: planned end 8:05 PM, tapped at 8:45 PM.
    setNow(at('2026-11-27', '20:45'));
    await open(bake, db);

    await fireEvent.press(await screen.findByRole('button', { name: 'Done, start Shape' }));
    await waitFor(() =>
      expect(snack()?.message).toContain('Bulk ferment done. Ready time now 10:40 AM (+40 min).'),
    );
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:40:00.000Z');
    expect(stepByName(after, 'Bulk ferment').status).toBe('done');
    expect(seen).toEqual([`${bake.bake.id}:event`]);

    // The panel moves on to Shape.
    expect(await screen.findByText('Shape')).toBeTruthy();

    // The ready-time card, with the hold line (cold ferment is already at its 12 h minimum).
    expect(
      screen.getByText(/Ready time is now 10:40 AM, 40 min later than planned\./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Cold ferment \(fridge\) is already at its shortest \(12 h\), so the ready time can't be held\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hold ready time' })).toBeNull();

    // Undo restores the plan.
    await act(async () => {
      snack()?.onAction?.();
    });
    await waitFor(async () =>
      expect((await db.repos.bakes.get(bake.bake.id))!.bake.plannedReadyAt).toBe(
        '2026-11-28T15:00:00.000Z',
      ),
    );
    expect(seen.at(-1)).toBe(`${bake.bake.id}:revert`);
  });

  it('Hold ready time shortens the cold ferment so the bake is ready at 10:00 AM again', async () => {
    const db = await seededDb();
    let bake = await makeBake(db, { durations: { Cold: 1080 } });
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '14:45'));
    await open(bake, db);

    await fireEvent.press(await screen.findByRole('button', { name: 'Done, start Shape' }));
    expect(
      await screen.findByText(/Shorten Cold ferment \(fridge\) to 17 h 20 min to keep 10:00 AM\./),
    ).toBeTruthy();
    // The busy window after a tap also covers Hold; wait it out like a real second tap would.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    const hold = screen.getByRole('button', { name: 'Hold ready time' });
    expect(hold.props.accessibilityHint).toBe('Shortens Cold ferment (fridge) to 17 h 20 min');
    await fireEvent.press(hold);
    await waitFor(() =>
      expect(snack()?.message).toBe(
        'Ready time held at 10:00 AM. Cold ferment (fridge) is now 17 h 20 min.',
      ),
    );
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:00:00.000Z');
    expect(stepByName(after, 'Cold ferment (fridge)').durationMin).toBe(1040);
  });

  it('+15 min extends the step and the ready time', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);
    await fireEvent.press(await screen.findByRole('button', { name: '+15 min' }));
    await waitFor(() =>
      expect(snack()?.message).toBe('Bulk ferment +15 min. Ready time now 10:15 AM.'),
    );
    expect(stepByName((await db.repos.bakes.get(bake.bake.id))!, 'Bulk ferment').durationMin).toBe(
      375,
    );
  });

  it('a second tap during the busy window does not complete a second step', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);
    const hero = await screen.findByRole('button', { name: 'Done, start Shape' });
    await fireEvent.press(hero);
    await fireEvent.press(hero);
    await waitFor(() => expect(snack()).not.toBeNull());
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(stepByName(after, 'Shape').status).toBe('pending');
  });
});

describe('overtime (B9)', () => {
  it('counts up past the end and offers "Finished earlier?" from 15 min over', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    const end = plannedEnd(bake, 'Bulk ferment');
    setNow(end + 12 * 60_000 + 30_000);
    await open(bake, db);
    expect(await screen.findByTestId(`countdown-${bake.items[0]!.id}`)).toHaveTextContent(
      '+12:30 over',
    );
    expect(screen.getByLabelText(/Bulk ferment, 12 minutes over time/)).toBeTruthy();
    expect(screen.queryByText('Finished earlier? Set the time')).toBeNull();

    clearClients();
  });

  it('a long overtime sets the time you actually finished, with a preview', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    // Slept through it: 8:05 PM planned end, now 11:30 PM.
    setNow(at('2026-11-27', '23:30'));
    await open(bake, db);
    expect(await screen.findByTestId(`countdown-${bake.items[0]!.id}`)).toHaveTextContent(
      '+3 h 25 min over',
    );
    expect(screen.getByText('Times below update when you tap Done.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Finished earlier? Set the time'));
    // Starts at the planned end, so the plan would not move.
    expect(await screen.findByTestId('finished-at-preview')).toHaveTextContent(
      'Ready time stays 10:00 AM.',
    );
    expect(screen.getAllByText('8:05 PM').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('finished-at-confirm'));
    await waitFor(async () =>
      expect(stepByName((await db.repos.bakes.get(bake.bake.id))!, 'Bulk ferment')).toMatchObject({
        status: 'done',
        actualEndAt: '2026-11-28T01:05:00.000Z',
      }),
    );
  });
});

describe('waiting, folds and ready', () => {
  it('before the first step: "Starts in", and Start now is a tonal, deliberate button', async () => {
    const db = await seededDb();
    const bake = await makeBake(db);
    setNow(at('2026-11-27', '02:00'));
    await open(bake, db);
    expect(await screen.findByText('Starts in')).toBeTruthy();
    expect(screen.getByTestId(`countdown-${bake.items[0]!.id}`)).toHaveTextContent('1 h 5 min');
    expect(screen.getByText('Starts Today 3:05 AM')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Final starter feeding now' }));
    await waitFor(() => expect(snack()?.message).toBe('Started early. Ready time now 8:55 AM.'));
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(after.bake.status).toBe('active');
    expect(stepByName(after, 'Final starter feeding')).toMatchObject({ status: 'active' });
  });

  it('folds: Fold n of N done, the next fold time, and no +15 min', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Stretch and folds');
    setNow(plannedStart(bake, 'Stretch and folds') + 60_000);
    await open(bake, db);
    expect(await screen.findByText('Fold now')).toBeTruthy();
    expect(screen.getByText('Fold 1 of 4 · next at 12:05 PM')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+15 min' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Bulk ferment now' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Fold 1 of 4 done' }));
    await waitFor(() => expect(snack()?.message).toBe('Fold 1 done. Next fold at 12:36 PM.'));
    const row = stepByName((await db.repos.bakes.get(bake.bake.id))!, 'Stretch and folds');
    expect(row.foldsDone).toBe(1);
    expect(await screen.findByText('Fold 2 of 4 · next at 12:36 PM')).toBeTruthy();
  });

  it('the final step has no +15 min and ends with "Done, finish bake"', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Cool');
    setNow(plannedStart(bake, 'Cool') + 10 * 60_000);
    await open(bake, db);
    expect(await screen.findByRole('button', { name: 'Done, finish bake' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+15 min' })).toBeNull();
    expect(screen.getByText('until ready · 10:00 AM')).toBeTruthy();
  });

  it('ready: past the final step it says so (not overtime) and Finish bake completes it', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Cool');
    setNow(plannedEnd(bake, 'Cool') + 20 * 60_000);
    await open(bake, db);
    expect(await screen.findByText('Ready since 10:00 AM')).toBeTruthy();
    expect(screen.queryByText(/over/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish bake' }));
    await waitFor(async () =>
      expect((await db.repos.bakes.get(bake.bake.id))!.bake.status).toBe('completed'),
    );
    expect(await screen.findByTestId('live-complete-title')).toBeTruthy();
    // The test bake is written without pantry prices, so the snapshot cost is incomplete.
    expect(screen.getByText('Cost incomplete')).toBeTruthy();
  });
});

describe('also now, coming up and the linked step', () => {
  it('lists the preheat with its own Done once it is due and the bake has not started', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Cold ferment (fridge)');
    setNow(fromIso(bake.steps.find((s) => s.stepKey === 'bake:preheat')!.plannedStartAt) + 60_000);
    await open(bake, db);
    expect(await screen.findByText('Also now')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Done, Preheat oven and Dutch oven' }),
    );
    await waitFor(() => expect(snack()?.message).toBe('Preheat oven and Dutch oven done.'));
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(after.steps.find((s) => s.stepKey === 'bake:preheat')?.status).toBe('done');
    // An alongside step never shifts anything.
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:00:00.000Z');
  });

  it('shows the next three steps and expands to every step, with done ones marked', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);
    expect(await screen.findByText('Coming up')).toBeTruthy();
    expect(screen.getByTestId(`coming-${stepByName(bake, 'Shape').id}`)).toBeTruthy();
    expect(screen.queryByTestId(`coming-${stepByName(bake, 'Cool').id}`)).toBeNull();
    await fireEvent.press(screen.getByTestId('coming-up-toggle'));
    expect(screen.getByTestId(`coming-${stepByName(bake, 'Cool').id}`)).toBeTruthy();
    expect(screen.getByLabelText('Mix and rest, marked done')).toBeTruthy();
  });

  it('?step= for a late step opens the full list and highlights it; an unknown id is ignored', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    const cool = stepByName(bake, 'Cool');
    const view = await open(bake, db, cool.id);
    const row = await screen.findByTestId(`coming-${cool.id}`);
    expect(row).toBeTruthy();
    await view.unmount();

    await open(bake, db, '00000000-0000-4000-8000-00000000ffff');
    expect(await screen.findByText('Bulk ferment')).toBeTruthy();
    expect(screen.queryByTestId(`coming-${cool.id}`)).toBeNull();
  });
});

describe('header, menu and keep-awake', () => {
  it('keeps the screen on by default, releases it on unmount, and the toggle writes the setting', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    useSettings.setState({ update } as never);
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    const view = await open(bake, db);
    await screen.findByText('Bulk ferment');
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('bake-live');
    await pressHeaderRightByTestId('live-keep-awake');
    expect(update).toHaveBeenCalledWith({ keepAwakeDefault: false });
    await view.unmount();
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith('bake-live');
  });

  it('Cancel bake asks first, then cancels and closes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);
    await screen.findByText('Bulk ferment');
    await pressHeaderRightByTestId('live-more');
    await fireEvent.press(await screen.findByTestId('action-Cancel bake'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]?.[0]).toBe('Cancel this bake?');
    await waitFor(async () =>
      expect((await db.repos.bakes.get(bake.bake.id))!.bake.status).toBe('cancelled'),
    );
    expect(routerSpies.back).toHaveBeenCalled();
    expect(snack()?.message).toBe('Bake cancelled.');
  });

  it('Ingredients opens the weights from the bake snapshot', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    setNow(at('2026-11-27', '17:00'));
    await open(bake, db);
    await fireEvent.press(await screen.findByRole('button', { name: 'Ingredients' }));
    expect(await screen.findByTestId('ingredients-sheet')).toBeTruthy();
    expect(screen.getByText(/^Total dough /)).toBeTruthy();
  });
});

describe('states without a live bake', () => {
  it('a bake that does not exist', async () => {
    const db = await seededDb();
    await renderScreen(<LiveBakeScreen id="00000000-0000-4000-8000-00000000ffff" />, { db });
    expect(await screen.findByText("This bake isn't here anymore.")).toBeTruthy();
  });

  it('a cancelled bake', async () => {
    const db = await seededDb();
    const bake = await makeBake(db);
    await createBakeService(db.repos, () => undefined).cancel(bake.bake.id, NOW);
    await open(bake, db);
    expect(await screen.findByText('This bake was cancelled.')).toBeTruthy();
  });

  it('a completed bake is read-only with its cost', async () => {
    const db = await seededDb();
    const bake = await makeBake(db);
    await createBakeService(db.repos, () => undefined).finish(
      bake.bake.id,
      plannedEnd(bake, 'Cool'),
    );
    setNow(plannedEnd(bake, 'Cool') + 60_000);
    await open(bake, db);
    expect(await screen.findByTestId('live-complete-title')).toBeTruthy();
    expect(screen.getByText(/^Started /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to bakes' })).toBeTruthy();
  });
});

describe('two recipes in one bake', () => {
  it('one panel and one hero per recipe, in a stable order, each named for its recipe', async () => {
    const db = await seededDb();
    let bake = await makeBake(db, {
      recipes: [{ id: COUNTRY }, { id: WHOLE_WHEAT }],
      ovenCapacity: 2,
      ready: { date: '2026-11-28', time: '12:00' },
    });
    bake = await startAt(db, bake, 'Bulk ferment', 0);
    bake = await startAt(db, bake, 'Bulk ferment', 1);
    setNow(plannedStart(bake, 'Bulk ferment', 1) + 30 * 60_000);
    await open(bake, db);
    expect(
      await screen.findByRole('button', { name: 'Done, start Shape for Country loaf' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Done, start Shape for Whole wheat loaf' }),
    ).toBeTruthy();
    expect(screen.getByText('A · Done, start Shape')).toBeTruthy();
    expect(screen.getByText('B · Done, start Shape')).toBeTruthy();

    // Marking A done leaves B's step alone.
    const before = stepByName(bake, 'Bulk ferment', 1);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Done, start Shape for Country loaf' }),
    );
    await waitFor(() => expect(snack()).not.toBeNull());
    const after = (await db.repos.bakes.get(bake.bake.id))!;
    expect(stepByName(after, 'Bulk ferment', 1)).toMatchObject({
      status: before.status,
      plannedEndAt: before.plannedEndAt,
    });
  });
});
