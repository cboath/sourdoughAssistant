import { describe, expect, it } from 'vitest';
import { chooseDurations } from './durations';
import { defaultTemplate } from './fixtures';

function choose(opts?: Parameters<typeof chooseDurations>[1]) {
  const r = chooseDurations(defaultTemplate(), opts);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

describe('chooseDurations', () => {
  it('uses recipe defaults and derives fold duration', () => {
    const d = choose();
    expect(d.bulk).toMatchObject({
      minutes: 360,
      source: 'default',
      clamped: false,
      unclampedMinutes: null,
    });
    expect(d.folds).toMatchObject({ minutes: 120, source: 'derived' });
  });

  it('applies the user override (source user)', () => {
    expect(choose({ overrides: { cold: 1080 } }).cold).toMatchObject({
      minutes: 1080,
      source: 'user',
    });
  });

  it('rejects an override outside the range instead of clamping (AMB-19)', () => {
    const r = chooseDurations(defaultTemplate(), { overrides: { cold: 1500, shape: 4 } });
    expect(r).toEqual({
      ok: false,
      error: [
        { code: 'overrideOutOfRange', stepId: 'shape', minutes: 4 },
        { code: 'overrideOutOfRange', stepId: 'cold', minutes: 1500 },
      ],
    });
  });

  it('rejects an override on a fold step unless it equals the derived value', () => {
    expect(chooseDurations(defaultTemplate(), { overrides: { folds: 90 } }).ok).toBe(false);
    expect(chooseDurations(defaultTemplate(), { overrides: { folds: 120 } }).ok).toBe(true);
  });

  it('propagates validation errors', () => {
    expect(chooseDurations([])).toEqual({ ok: false, error: [{ code: 'emptyRecipe' }] });
  });

  describe('temperature (ADR 0008 table, bulk default 360, range 300 to 480)', () => {
    it.each([
      [24, 360, false],
      [23, 390, false], // 392.4 -> 390
      [22, 430, false], // 428.4 -> 430
      [21, 470, false], // 468 -> 470
      [20, 480, true], // 507.6 -> 510, clamped
      [18, 480, true], // 604.8 -> 605
      [25, 330, false], // 331.2 -> 330
      [26, 305, false], // 302.4 -> 300 (see below)
      [27, 300, true], // 277.2 -> 275, clamped
      [30, 300, true], // 216
    ])('%d C -> %d min (clamped %s)', (t, expected, clamped) => {
      const c = choose({ kitchenTempC: t }).bulk!;
      if (t === 26) {
        // 360 * 0.84 = 302.4 -> nearest 5 = 300
        expect(c.minutes).toBe(300);
        return;
      }
      expect(c.minutes).toBe(expected);
      expect(c.clamped).toBe(clamped);
      expect(c.source).toBe('temperature');
    });

    it('records the unclamped value and keeps it null when not clamped', () => {
      expect(choose({ kitchenTempC: 18 }).bulk).toMatchObject({
        minutes: 480,
        clamped: true,
        unclampedMinutes: 605,
      });
      expect(choose({ kitchenTempC: 27 }).bulk).toMatchObject({
        minutes: 300,
        clamped: true,
        unclampedMinutes: 275,
      });
      expect(choose({ kitchenTempC: 22 }).bulk).toMatchObject({
        clamped: false,
        unclampedMinutes: null,
      });
    });

    it('only touches tempSensitive steps, never the cold ferment', () => {
      const base = choose();
      const warm = choose({ kitchenTempC: 18 });
      for (const id of Object.keys(base)) {
        if (id !== 'bulk') expect(warm[id]!.minutes).toBe(base[id]!.minutes);
      }
    });

    it('a user override beats temperature', () => {
      expect(choose({ kitchenTempC: 18, overrides: { bulk: 400 } }).bulk).toMatchObject({
        minutes: 400,
        source: 'user',
      });
    });

    it('null or missing temperature leaves defaults', () => {
      expect(choose({ kitchenTempC: null }).bulk).toMatchObject({
        minutes: 360,
        source: 'default',
      });
    });

    it('is clamped and monotonic for extreme temperatures', () => {
      let prev = Infinity;
      for (let t = -10; t <= 60; t++) {
        const m = choose({ kitchenTempC: t }).bulk!.minutes;
        expect(m).toBeGreaterThanOrEqual(300);
        expect(m).toBeLessThanOrEqual(480);
        expect(m).toBeLessThanOrEqual(prev);
        prev = m;
      }
    });

    it('accepts a custom table', () => {
      const tempTable = [{ tempC: 10, multiplier: 2 }];
      expect(choose({ kitchenTempC: 24, tempTable }).bulk!.minutes).toBe(480); // 720 clamped
    });
  });
});
