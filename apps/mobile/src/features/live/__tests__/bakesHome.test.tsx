/** RN-08: the Bakes home list and the pure card, phase and panel view models. */
import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Alert } from 'react-native';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { clock } from '../../../lib/clock';
import { useSnackbarStore } from '../../../state/snackbar';
import { createBakeService } from '../../schedule/services/bakeService';
import { cardFor } from '../card';
import { BakesHomeScreen, sectionRows } from '../components/BakesHomeScreen';
import { deriveBakeLive } from '../derive';
import { heroFor, panelFor } from '../panel';
import {
  COUNTRY,
  NOW,
  QUIET,
  WHOLE_WHEAT,
  ZONE,
  at,
  makeBake,
  plannedEnd,
  seededDb,
  startAt,
  stepByName,
} from './helpers';

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

const originalNow = clock.now;
const originalZone = clock.zone;
const setNow = (ms: number) => {
  clock.now = () => ms;
};
const ctxAt = (now: number) => ({ zone: ZONE, locale: 'en-US', now });

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
  clearClients();
  routerSpies.reset();
  useSnackbarStore.setState({ current: null, clearances: {} });
  jest.restoreAllMocks();
});

describe('derive, card and panel', () => {
  it('a bake before its first step is waiting, with "Starts ..." and the first step', async () => {
    const db = await seededDb();
    const bake = await makeBake(db);
    const live = deriveBakeLive(bake, NOW);
    expect(live.phase).toBe('waiting');
    const card = cardFor(bake, live, ctxAt(NOW));
    expect(card.variant).toBe('upcoming');
    expect(card.headline).toBe('Starts Tomorrow 3:05 AM');
    expect(card.lines).toEqual(['First: Final starter feeding · Ready Sat 10:00 AM']);
    expect(card.progress).toBeNull();
  });

  it('a running bake: step, minutes left, next step, ready time and progress', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    const now = at('2026-11-27', '17:46');
    const live = deriveBakeLive(bake, now);
    expect(live.phase).toBe('running');
    const card = cardFor(bake, live, ctxAt(now));
    expect(card.headline).toBe('Bulk ferment');
    expect(card.countdown).toBe('2 h 19 min left');
    expect(card.lines).toEqual(['Next: Shape at 8:05 PM', 'Ready Tomorrow 10:00 AM']);
    expect(card.a11yLabel).toContain('Country loaf. Bulk ferment, 2 hours 19 minutes left');
  });

  it('overtime and ready are different phases', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    bake = await startAt(db, bake, 'Bulk ferment');
    const over = deriveBakeLive(bake, plannedEnd(bake, 'Bulk ferment') + 12 * 60_000);
    expect(over.phase).toBe('overtime');
    expect(over.overtimeCount).toBe(1);
    expect(
      cardFor(bake, over, ctxAt(plannedEnd(bake, 'Bulk ferment') + 12 * 60_000)).countdown,
    ).toBe('+12 min over');
    bake = await startAt(db, bake, 'Cool');
    const ready = deriveBakeLive(bake, plannedEnd(bake, 'Cool') + 60_000);
    expect(ready.phase).toBe('ready');
    expect(ready.overtimeCount).toBe(0);
    expect(cardFor(bake, ready, ctxAt(NOW)).lines).toEqual(['Tap to finish the bake.']);
  });

  it('the panel shows the hero for each state', async () => {
    const db = await seededDb();
    let bake = await makeBake(db);
    const waiting = deriveBakeLive(bake, NOW).items[0]!;
    expect(heroFor(bake, waiting, false)).toMatchObject({
      kind: 'startNow',
      variant: 'tonal',
      size: 'lg',
    });
    bake = await startAt(db, bake, 'Bulk ferment');
    const now = at('2026-11-27', '17:00');
    const running = deriveBakeLive(bake, now).items[0]!;
    expect(heroFor(bake, running, false)).toMatchObject({
      kind: 'done',
      label: 'Done, start Shape',
      size: 'hero',
    });
    const panel = panelFor(bake, running, ctxAt(now), QUIET, 'C');
    expect(panel.countdown).toBe('3 h 5 min');
    // Shape starts at 8:05 PM, outside quiet hours; the Cool step is at 9 AM. No quiet tag here.
    expect(panel.tags).toEqual([]);
  });

  it('the step before the 3:05 AM feed warns that the next step falls in quiet hours', async () => {
    const db = await seededDb();
    const bake = await makeBake(db, { mode: 'forward', now: at('2026-11-27', '02:00') });
    // Forward bake starts now: feeding is current, and its next step (mix) starts 8 h later.
    const live = deriveBakeLive(bake, at('2026-11-27', '02:30'));
    const panel = panelFor(bake, live.items[0]!, ctxAt(at('2026-11-27', '02:30')), QUIET, 'C');
    expect(panel.stepName).toBe('Final starter feeding');
    expect(panel.tags.map((x) => x.id)).not.toContain('adjusted');
  });

  it('sections: overtime first, upcoming last', async () => {
    const db = await seededDb();
    let a = await makeBake(db);
    a = await startAt(db, a, 'Bulk ferment');
    const b = await makeBake(db, {
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-12-02', time: '10:00' },
    });
    const now = plannedEnd(a, 'Bulk ferment') + 5 * 60_000;
    const { rows } = sectionRows([b, a], now);
    expect(rows.map((r) => (r.type === 'header' ? r.title : r.id))).toEqual([
      'Now',
      a.bake.id,
      'Upcoming',
      b.bake.id,
    ]);
  });
});

describe('Bakes home', () => {
  it('empty: one button, no pinned bar', async () => {
    const db = await seededDb();
    await renderScreen(<BakesHomeScreen />, { db });
    expect(await screen.findByText('Plan your next loaf')).toBeTruthy();
    expect(screen.queryByTestId('home-schedule')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Schedule a bake' }));
    expect(routerSpies.push).toHaveBeenCalledWith('/bake/schedule');
  });

  it('lists a running and an upcoming bake and opens one', async () => {
    const db = await seededDb();
    let a = await makeBake(db);
    a = await startAt(db, a, 'Bulk ferment');
    const b = await makeBake(db, {
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-12-02', time: '10:00' },
    });
    setNow(at('2026-11-27', '17:46'));
    await renderScreen(<BakesHomeScreen />, { db });
    expect(await screen.findByText('Now')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('2 h 19 min left')).toBeTruthy();
    expect(screen.getByTestId('home-schedule')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`bake-card-${a.bake.id}`));
    expect(routerSpies.push).toHaveBeenCalledWith(`/bake/${a.bake.id}`);
    expect(screen.getByTestId(`bake-card-${b.bake.id}`)).toBeTruthy();
  });

  it('a completed bake drops off the list', async () => {
    const db = await seededDb();
    const a = await makeBake(db);
    await createBakeService(db.repos, () => undefined).finish(a.bake.id, NOW);
    await renderScreen(<BakesHomeScreen />, { db });
    expect(await screen.findByText('Plan your next loaf')).toBeTruthy();
  });

  it('the long-press menu cancels a bake after a confirm', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const db = await seededDb();
    const a = await makeBake(db);
    await renderScreen(<BakesHomeScreen />, { db });
    await fireEvent(await screen.findByTestId(`bake-card-${a.bake.id}`), 'longPress');
    await fireEvent.press(await screen.findByTestId('action-Cancel bake'));
    await waitFor(async () =>
      expect((await db.repos.bakes.get(a.bake.id))!.bake.status).toBe('cancelled'),
    );
    expect(stepByName(a, 'Shape')).toBeDefined();
    expect(COUNTRY).toBeDefined();
  });

  it('a read error shows a retry', async () => {
    const db = await seededDb();
    jest.spyOn(db.repos.bakes, 'list').mockRejectedValue(new Error('boom'));
    await renderScreen(<BakesHomeScreen />, { db });
    expect(await screen.findByText("Couldn't load your bakes.")).toBeTruthy();
  });
});
