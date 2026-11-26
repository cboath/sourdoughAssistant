/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: kitchen temperature (ADR 0008). PROVISIONAL: the table awaits Chris (Q7). Values change by data only. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMP_TABLE,
  REFERENCE_TEMP_C,
  temperatureMultiplier,
} from '../../src/schedule/temperature';
import { chooseDurations } from '../../src/schedule/durations';
import { fahrenheitToCelsius } from '../../src/units';
import { backward } from './support/plan';
import { defaultTemplate, input, ITEM, iso, ms, NOV28, stepOf } from './support/fixtures';

const FAR_PAST = ms('2025-01-01T00:00:00.000Z');
const steps = () => defaultTemplate() as any[];
const choose = (opts: any, st: any[] = steps()) => {
  const r: any = chooseDurations(st, opts);
  expect(r.ok).toBe(true);
  return r.value as Record<string, any>;
};

describe('table and multiplier (PROVISIONAL)', () => {
  it('TMP-T1 reference temperature and table rows from ADR 0008', () => {
    expect(REFERENCE_TEMP_C).toBe(24);
    const expected: [number, number][] = [
      [18, 1.68],
      [19, 1.54],
      [20, 1.41],
      [21, 1.3],
      [22, 1.19],
      [23, 1.09],
      [24, 1],
      [25, 0.92],
      [26, 0.84],
      [27, 0.77],
      [28, 0.71],
      [29, 0.65],
      [30, 0.6],
    ];
    expect(DEFAULT_TEMP_TABLE.map((r) => [r.tempC, r.multiplier])).toEqual(expected);
  });
  it.each([
    [24, 1],
    [23.5, 1.045],
    [27.5, 0.74],
    [18, 1.68],
    [10, 1.68], // beyond the table: end row
    [30, 0.6],
    [40, 0.6],
  ])('TMP-T2 temperatureMultiplier(%s) = %s (linear interpolation, end rows beyond)', (t, m) => {
    expect(temperatureMultiplier(t)).toBeCloseTo(m, 9);
  });
  it('TMP-06 monotonic: multiplier never increases as temperature rises', () => {
    let prev = Infinity;
    for (let t = 10; t <= 40; t += 0.5) {
      const m = temperatureMultiplier(t);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
  it('TMP-07 75.2 F gives the same multiplier as 24 C', () => {
    expect(temperatureMultiplier(fahrenheitToCelsius(75.2))).toBeCloseTo(
      temperatureMultiplier(24),
      9,
    );
  });
});

describe('chooseDurations: bulk (default 360, range 300-480) by kitchen temperature', () => {
  // [tempC, minutes, clamped, unclamped]
  const rows: [number, number, boolean, number | null][] = [
    [18, 480, true, 605],
    [19, 480, true, 555],
    [20, 480, true, 510],
    [21, 470, false, null],
    [22, 430, false, null],
    [23, 390, false, null],
    [24, 360, false, null],
    [25, 330, false, null],
    [26, 300, false, null],
    [27, 300, true, 275],
    [28, 300, true, 255],
    [29, 300, true, 235],
    [30, 300, true, 215],
    [35, 300, true, 215],
    [10, 480, true, 605],
  ];
  it.each(rows)('TMP-09 %s C -> %s min (clamped %s)', (t, minutes, clamped, unclamped) => {
    const b = choose({ kitchenTempC: t }).bulk;
    expect(b.minutes).toBe(minutes);
    expect(b.clamped).toBe(clamped);
    expect(b.unclampedMinutes).toBe(unclamped);
    if (t !== 24) expect(b.source).toBe('temperature');
    else expect(['default', 'temperature']).toContain(b.source);
  });

  it('TMP-01/05 reference temp, null temp and missing temp leave defaults untouched', () => {
    for (const opts of [{ kitchenTempC: 24 }, { kitchenTempC: null }, {}, undefined]) {
      const d = choose(opts);
      expect(d.bulk.minutes).toBe(360);
    }
    expect(choose({ kitchenTempC: null }).bulk.source).toBe('default');
  });
  it('TMP-04 only tempSensitive steps change; cold ferment and fixed steps never do', () => {
    const d = choose({ kitchenTempC: 21 });
    for (const s of steps()) {
      if (s.id === 'bulk') continue;
      expect(d[s.id].minutes).toBe(s.durationMin);
      expect(d[s.id].clamped).toBe(false);
    }
    expect(d.folds.source).toBe('derived');
  });
  it('TMP-04b a step flagged tempSensitive (feed) does change', () => {
    const st = steps().map((s) => (s.id === 'feed' ? { ...s, tempSensitive: true } : s));
    const f = choose({ kitchenTempC: 21 }, st).feed; // 480 x 1.30 = 624 -> 625 -> clamped to max 600
    expect(f).toMatchObject({
      minutes: 600,
      clamped: true,
      unclampedMinutes: 625,
      source: 'temperature',
    });
  });
  it('TMP-10 a user slider value always beats temperature (source user)', () => {
    const d = choose({ kitchenTempC: 21, overrides: { bulk: 400 } });
    expect(d.bulk).toMatchObject({ minutes: 400, source: 'user', clamped: false });
  });
  it('TMP-03 never leaves [minMin, maxMin] at any temperature from -10 to 60 C', () => {
    for (let t = -10; t <= 60; t += 2.5) {
      const m = choose({ kitchenTempC: t }).bulk.minutes;
      expect(m).toBeGreaterThanOrEqual(300);
      expect(m).toBeLessThanOrEqual(480);
    }
  });
  it('TMP-02 warmer is not slower, cooler is not faster', () => {
    expect(choose({ kitchenTempC: 28 }).bulk.minutes).toBeLessThanOrEqual(360);
    expect(choose({ kitchenTempC: 20 }).bulk.minutes).toBeGreaterThanOrEqual(360);
  });
  it('rounds half up to the nearest 5 minutes even with float noise (102.5 -> 105)', () => {
    const st = [{ ...steps()[3], id: 't', durationMin: 100, minMin: 50, maxMin: 200 }];
    const d = choose({ kitchenTempC: 24, tempTable: [{ tempC: 24, multiplier: 1.025 }] }, st);
    expect(d.t.minutes).toBe(105);
  });
  it('the temperature starts from the recipe default, not a previous slider value', () => {
    expect(choose({ kitchenTempC: 21 }).bulk.minutes).toBe(
      choose({ kitchenTempC: 21, overrides: {} }).bulk.minutes,
    );
  });
});

describe('temperature inside a plan', () => {
  const ready = ms(NOV28.readyUtc);
  it('TMP-08 27 C clamps bulk to 300 min: feed Fri 04:05, temperatureClamped warning, source temperature', () => {
    const r = backward(input({}, { durations: { kitchenTempC: 27 } }), ready, FAR_PAST);
    expect(r.status).toBe('ok');
    const p = r.plan;
    expect(iso(p.startAt)).toBe('2026-11-27T09:05:00.000Z');
    expect(iso(stepOf(p, ITEM, 'bulk').startAt)).toBe('2026-11-27T20:05:00.000Z');
    expect(stepOf(p, ITEM, 'bulk').durationSource).toBe('temperature');
    expect(stepOf(p, ITEM, 'shape').startAt).toBe(ms(NOV28.starts.shape!)); // steps after bulk do not move
    expect(p.warnings).toContainEqual({
      code: 'temperatureClamped',
      stepKey: `${ITEM}:bulk`,
      minutes: 300,
      unclampedMinutes: 275,
    });
  });
  it('21 C (not clamped) shifts earlier steps by exactly the 110 min added and emits no warning', () => {
    const p = backward(input({}, { durations: { kitchenTempC: 21 } }), ready, FAR_PAST).plan;
    expect(ms(NOV28.starts.feed!) - p.startAt).toBe(110 * 60_000);
    expect(p.warnings).toEqual([]);
  });
});
