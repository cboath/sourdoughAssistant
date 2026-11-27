import type { CostBreakdown } from '@sourdough/core';
import { addDays, lastBakeTimeOfDay, smartReadyLocal } from '../defaults';
import { buildCostSnapshot, isStorableBreakdown } from '../snapshot';
import { fractionOf, snapMinutes, valueAt } from '../sliderMath';
import { MAX_LOAVES, useScheduleDraft } from '../store';
import { formatDayTime, formatSpan, formatTemperature } from '../time';
import { buildNewBake, BakeNotSchedulableError } from '../services/bakeService';
import { buildPreview } from '../preview';
import { NOW, ZONE, previewInput } from './helpers';
import type { Bake } from '../../../db/types';

const bake = (createdAt: string, requestedReadyAt: string | null) =>
  ({ createdAt, requestedReadyAt }) as Bake;

describe('smart default ready time (D4)', () => {
  it('uses the last bake time of day, else 10:00', () => {
    // 2026-11-21 15:00Z is 10:00 in New York.
    expect(lastBakeTimeOfDay([], ZONE)).toBeNull();
    expect(
      lastBakeTimeOfDay(
        [
          bake('2026-11-01T00:00:00Z', '2026-11-14T19:00:00Z'),
          bake('2026-11-20T00:00:00Z', '2026-11-21T15:00:00Z'),
        ],
        ZONE,
      ),
    ).toBe('10:00');
    // A start-now bake has no requested time and is skipped.
    expect(lastBakeTimeOfDay([bake('2026-11-25T00:00:00Z', null)], ZONE)).toBeNull();
  });

  it('picks the earliest date where the schedule fits', () => {
    const earliest = NOW + (30 * 60 + 55) * 60_000;
    expect(smartReadyLocal({ now: NOW, zone: ZONE, timeOfDay: '10:00', earliest })).toEqual({
      date: '2026-11-28',
      time: '10:00',
    });
    expect(smartReadyLocal({ now: NOW, zone: ZONE, timeOfDay: '18:00', earliest })).toEqual({
      date: '2026-11-27',
      time: '18:00',
    });
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02');
  });
});

describe('slider math', () => {
  it('snaps to 5 minutes from the minimum and stays in range', () => {
    expect(snapMinutes(727, 720, 1440)).toBe(725);
    expect(snapMinutes(5000, 720, 1440)).toBe(1440);
    expect(snapMinutes(1, 720, 1440)).toBe(720);
    expect(valueAt(0, 200, 720, 1440)).toBe(720);
    expect(valueAt(200, 200, 720, 1440)).toBe(1440);
    expect(valueAt(100, 200, 720, 1440)).toBe(1080);
    expect(valueAt(10, 0, 720, 1440)).toBe(720);
    expect(fractionOf(1080, 720, 1440)).toBe(0.5);
  });
});

describe('cost snapshot safety (SEC-M3-01)', () => {
  const breakdown = (over: Partial<CostBreakdown> = {}): CostBreakdown => ({
    lines: [],
    batchCents: 278,
    loaves: 2,
    perLoafCents: 139,
    complete: true,
    incompleteLineIds: [],
    ...over,
  });
  it('never stores a non-finite or unsafe cost', () => {
    expect(isStorableBreakdown(breakdown())).toBe(true);
    expect(isStorableBreakdown(breakdown({ batchCents: Infinity }))).toBe(false);
    expect(isStorableBreakdown(breakdown({ perLoafCents: NaN }))).toBe(false);
    expect(isStorableBreakdown(breakdown({ batchCents: Number.MAX_SAFE_INTEGER + 2 }))).toBe(false);
    const line = {
      lineId: 'a',
      name: 'x',
      billedG: 1,
      costCents: Infinity,
      belowOneCent: false,
      sharePct: null,
      status: 'priced' as const,
    };
    expect(isStorableBreakdown(breakdown({ lines: [line] }))).toBe(false);
    expect(
      buildCostSnapshot(
        { breakdown: breakdown(), sellCents: null, storable: false },
        'USD',
        'now',
        1,
      ),
    ).toBeNull();
    expect(
      buildCostSnapshot(
        { breakdown: breakdown(), sellCents: 5, storable: true },
        'USD',
        'now',
        20000,
      ),
    ).toMatchObject({
      snapshotVersion: 1,
      sellPriceCents: 5,
    });
  });
});

describe('draft store', () => {
  afterEach(() => useScheduleDraft.getState().reset());
  it('keeps sliders for recipes that stay and caps at four recipes', () => {
    const s = useScheduleDraft.getState();
    s.setSelection([{ recipeId: 'a', loaves: 1 }]);
    const id = useScheduleDraft.getState().items[0]!.tempId;
    useScheduleDraft.getState().setOverride(id, 'step', 600);
    useScheduleDraft
      .getState()
      .setSelection(['a', 'b', 'c', 'd', 'e'].map((recipeId) => ({ recipeId, loaves: 99 })));
    const { items } = useScheduleDraft.getState();
    expect(items.map((i) => i.recipeId)).toEqual(['a', 'b', 'c', 'd']);
    expect(items[0]).toMatchObject({ tempId: id, overrides: { step: 600 }, loaves: MAX_LOAVES });
    useScheduleDraft.getState().addItem({ recipeId: 'e', loaves: 1 });
    expect(useScheduleDraft.getState().items).toHaveLength(4);
  });
  it('a computed default is not a user change; a picked time is', () => {
    useScheduleDraft.getState().setDefaultReady({ date: '2026-11-28', time: '10:00' });
    expect(useScheduleDraft.getState().touched).toBe(false);
    useScheduleDraft.getState().setReadyLocal({ date: '2026-11-29', time: '10:00' });
    expect(useScheduleDraft.getState().touched).toBe(true);
    useScheduleDraft.getState().markSaved();
    expect(useScheduleDraft.getState().touched).toBe(false);
  });
});

describe('formatting', () => {
  const ctx = { zone: ZONE, locale: 'en-US', now: NOW };
  it('formats relative days, spans and temperature', () => {
    expect(formatDayTime(NOW + 3_600_000, ctx)).toBe('Today 10:00 AM');
    expect(formatDayTime(NOW + 24 * 3_600_000, ctx)).toBe('Tomorrow 9:00 AM');
    expect(formatDayTime(NOW + 2 * 24 * 3_600_000, ctx)).toBe('Sat 9:00 AM');
    expect(formatDayTime(NOW + 2 * 24 * 3_600_000, ctx, true)).toBe('Saturday 9:00 AM');
    expect(formatDayTime(NOW + 10 * 24 * 3_600_000, ctx)).toBe('Sun, Dec 6 9:00 AM');
    expect(formatSpan(30 * 60 + 55, 'en-US')).toBe('30 h 55 min');
    expect(formatSpan(54 * 60, 'en-US')).toBe('2 d 6 h');
    expect(formatTemperature(27, 'C')).toBe('27 °C');
    expect(formatTemperature(27, 'F')).toBe('81 °F');
  });
});

describe('buildNewBake', () => {
  it('refuses a plan that is not ok', () => {
    const preview = buildPreview(previewInput([]));
    expect(() =>
      buildNewBake({
        preview,
        mode: 'backward',
        items: [],
        kitchenTempC: null,
        ovenCapacity: 1,
        reheatGapMin: 0,
        headsUpMin: 15,
        currencyCode: 'USD',
        markupBps: 0,
        sellRoundingCents: 0,
        pantryItems: [],
        zone: ZONE,
        now: NOW,
      }),
    ).toThrow(BakeNotSchedulableError);
  });
});
