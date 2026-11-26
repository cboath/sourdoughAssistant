import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMP_TABLE, REFERENCE_TEMP_C, temperatureMultiplier } from './temperature';

describe('temperatureMultiplier', () => {
  it('is 1 at the reference temperature', () => {
    expect(REFERENCE_TEMP_C).toBe(24);
    expect(temperatureMultiplier(24)).toBe(1);
  });

  it.each(DEFAULT_TEMP_TABLE.map((r) => [r.tempC, r.multiplier] as const))(
    'table row %d C = %d',
    (t, m) => {
      expect(temperatureMultiplier(t)).toBe(m);
    },
  );

  it('matches 1.09^(24 - T) rounded to 2 dp', () => {
    for (const r of DEFAULT_TEMP_TABLE) {
      expect(r.multiplier).toBe(Math.round(1.09 ** (24 - r.tempC) * 100) / 100);
    }
  });

  it('interpolates linearly between rows', () => {
    expect(temperatureMultiplier(24.5)).toBeCloseTo(0.96, 10);
    expect(temperatureMultiplier(20.5)).toBeCloseTo((1.41 + 1.3) / 2, 10);
  });

  it('uses the end rows beyond the table', () => {
    expect(temperatureMultiplier(10)).toBe(1.68);
    expect(temperatureMultiplier(-10)).toBe(1.68);
    expect(temperatureMultiplier(60)).toBe(0.6);
  });

  it('is monotonic non-increasing in temperature', () => {
    let prev = Infinity;
    for (let t = -10; t <= 60; t += 0.25) {
      const m = temperatureMultiplier(t);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });

  it('accepts a custom (unsorted) table and an empty one', () => {
    const table = [
      { tempC: 30, multiplier: 0.5 },
      { tempC: 20, multiplier: 1.5 },
    ];
    expect(temperatureMultiplier(25, table)).toBe(1);
    expect(temperatureMultiplier(25, [])).toBe(1);
  });
});
