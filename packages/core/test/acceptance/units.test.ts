/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: unit conversion acceptance (core-cases section 3, core-api section 2). Imports from module paths, not src/index. */
import { describe, expect, it } from 'vitest';
import {
  GRAMS_PER_UNIT,
  ML_PER_UNIT,
  ML_PER_US_CUP,
  WATER_GRAMS_PER_ML,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatAmount,
  fromGrams,
  isUnit,
  toGrams,
  unitDimension,
} from '../../src/units';
import { percent, roundHalfUp, roundToStep } from '../../src/types';

const D = { gramsPerCup: 120 };
const val = (r: any) => {
  expect(r.ok).toBe(true);
  return r.value as number;
};

describe('constants (AMB-12)', () => {
  it('UNT-C1 mass factors', () => {
    expect(GRAMS_PER_UNIT).toMatchObject({ g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 });
  });
  it('UNT-C2 US customary volume factors', () => {
    expect(ML_PER_US_CUP).toBe(236.5882365);
    expect(ML_PER_UNIT.cup).toBeCloseTo(236.5882365, 9);
    expect(ML_PER_UNIT.tbsp).toBeCloseTo(236.5882365 / 16, 9);
    expect(ML_PER_UNIT.tsp).toBeCloseTo(236.5882365 / 48, 9);
    expect(ML_PER_UNIT.floz).toBeCloseTo(236.5882365 / 8, 9);
    expect(ML_PER_UNIT.qt).toBeCloseTo(236.5882365 * 4, 9);
    expect(ML_PER_UNIT.gal).toBeCloseTo(236.5882365 * 16, 9);
    expect(ML_PER_UNIT.ml).toBe(1);
    expect(ML_PER_UNIT.l).toBe(1000);
  });
  it('UNT-C3 water density constant', () => expect(WATER_GRAMS_PER_ML).toBe(1));
  it('UNT-C4 dimensions and guards', () => {
    expect(unitDimension('kg')).toBe('mass');
    expect(unitDimension('cup')).toBe('volume');
    expect(unitDimension('each')).toBe('count');
    expect(isUnit('tbsp')).toBe(true);
    expect(isUnit('stone')).toBe(false);
  });
});

describe('toGrams / fromGrams table', () => {
  // [id, amount, unit, factors, expectedGrams, digits]
  const toG: [string, number, any, any, number, number][] = [
    ['UNT-01', 1, 'kg', undefined, 1000, 9],
    ['UNT-02', 1, 'lb', undefined, 453.59237, 9],
    ['UNT-03', 1, 'oz', undefined, 28.349523125, 9],
    ['UNT-05', 5, 'lb', undefined, 2267.96185, 9],
    ['UNT-07', 1, 'cup', D, 120, 9],
    ['UNT-08', 2.5, 'cup', D, 300, 9],
    ['UNT-09', 1, 'tbsp', D, 7.5, 9],
    ['UNT-10', 1, 'tsp', D, 2.5, 9],
    ['UNT-16', 30, 'ml', { gramsPerCup: 0.92 * ML_PER_US_CUP }, 27.6, 9],
    ['UNT-E1', 50, 'each', { gramsPerEach: 50 }, 2500, 9],
    ['UNT-18a', 0, 'g', undefined, 0, 9],
  ];
  it.each(toG)('%s toGrams(%s %s)', (_id, amount, unit, factors, expected, digits) => {
    expect(val(toGrams(amount, unit, factors))).toBeCloseTo(expected, digits);
  });

  it('UNT-04 16 oz -> 1 lb', () => {
    expect(val(fromGrams(val(toGrams(16, 'oz')), 'lb'))).toBeCloseTo(1, 9);
  });
  it('UNT-06 1000 g -> oz', () => expect(val(fromGrams(1000, 'oz'))).toBeCloseTo(35.27396195, 7));
  it('UNT-11 300 g -> 2.5 cup', () => expect(val(fromGrams(300, 'cup', D))).toBeCloseTo(2.5, 9));
  it('UNT-14 1 L -> 1000 ml', () =>
    expect(val(fromGrams(val(toGrams(1, 'l', D)), 'ml', D))).toBeCloseTo(1000, 6));

  it.each([
    ['UNT-17a', 123.456, 'oz'],
    ['UNT-17b', 7.25, 'lb'],
    ['UNT-17c', 3.75, 'cup'],
    ['UNT-17d', 2, 'tbsp'],
  ])('%s round trip %s %s within 1e-9', (_id, amount, unit) => {
    const g = val(toGrams(amount as number, unit as any, D));
    expect(val(fromGrams(g, unit as any, D))).toBeCloseTo(amount as number, 9);
  });
});

describe('typed errors, never NaN (UNT-12, UNT-15, UNT-18, UNT-19)', () => {
  it('UNT-12 volume without density', () => {
    expect(fromGrams(100, 'cup')).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'cup' },
    });
    expect(toGrams(1, 'cup')).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'cup' },
    });
  });
  it('UNT-19 ml without density is not silently treated as grams', () => {
    expect(toGrams(250, 'ml')).toMatchObject({ ok: false, error: { code: 'missingDensity' } });
  });
  it('UNT-15 each without weight', () => {
    expect(toGrams(1, 'each')).toEqual({
      ok: false,
      error: { code: 'missingEachWeight', unit: 'each' },
    });
    expect(val(toGrams(1, 'each', { gramsPerEach: 55 }))).toBe(55);
  });
  it.each([[-5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'UNT-18 invalid amount %s',
    (amount) => {
      const r: any = toGrams(amount, 'g');
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe('invalidAmount');
    },
  );
});

describe('temperature conversion', () => {
  it('known points', () => {
    expect(celsiusToFahrenheit(24)).toBeCloseTo(75.2, 9);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 9);
  });
  it('TMP-07 75.2 F equals 24 C', () => expect(fahrenheitToCelsius(75.2)).toBeCloseTo(24, 9));
});

describe('formatAmount (PROPOSED: exact strings depend on locale formatting)', () => {
  it('FMT-A1 us with density gives quarter cups', () => {
    const r = formatAmount(270, { unitSystem: 'us', locale: 'en-US', factors: D });
    expect(r.primary).toMatch(/270/);
    expect(r.secondary).toBe('2 ¼ cups');
  });
  it('FMT-A2 metric gives oz to 1 dp', () => {
    const r = formatAmount(100, { unitSystem: 'metric', locale: 'en-US' });
    expect(r.secondary).toMatch(/3\.5\s?oz/);
  });
  it('FMT-A3 under 15 g with density uses tbsp/tsp (us)', () => {
    const r = formatAmount(7.5, { unitSystem: 'us', locale: 'en-US', factors: D });
    expect(r.secondary).toMatch(/1\s?tbsp/);
  });
});

describe('rounding primitives (AMB-01)', () => {
  it.each([
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [2.4, 2],
    [0, 0],
    [17.49999999999999, 18], // float noise below .5 is absorbed
    [0.4999, 0],
  ])('roundHalfUp(%s) = %s', (x, e) => expect(roundHalfUp(x)).toBe(e));
  it.each([
    [17.3, 0.5, 17.5],
    [17.2, 0.5, 17],
    [12, 5, 10],
    [12.5, 5, 15],
    [102.5, 5, 105],
  ])('roundToStep(%s, %s) = %s', (x, s, e) => expect(roundToStep(x, s)).toBeCloseTo(e, 9));
  it.each([
    [309, 400, undefined, 77.3], // RCP-12: never 77.2
    [425, 550, undefined, 77.3],
    [1, 3, undefined, 33.3],
    [2, 3, undefined, 66.7],
    [1, 3, 2, 33.33],
    [1, 8, 0, 13],
    [1, 8, 1, 12.5],
  ])('percent(%s,%s,dp=%s) = %s', (n, d, dp, e) => expect(percent(n, d, dp as any)).toBe(e));
  it('percent with zero or negative denominator is null', () => {
    expect(percent(5, 0)).toBeNull();
    expect(percent(5, -1)).toBeNull();
  });
});
