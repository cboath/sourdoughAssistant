import { describe, expect, it } from 'vitest';
import {
  ML_PER_UNIT,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  fromGrams,
  isUnit,
  toGrams,
  unitDimension,
  type Unit,
} from './units';

const f = { gramsPerCup: 120 };
const g = (a: number, u: Unit, x = {}) => {
  const r = toGrams(a, u, x);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe('toGrams', () => {
  it('mass units (UNT-01..05)', () => {
    expect(g(1, 'kg')).toBe(1000);
    expect(g(1, 'lb')).toBe(453.59237);
    expect(g(1, 'oz')).toBe(28.349523125);
    expect(g(5, 'lb')).toBeCloseTo(2267.96185, 9);
  });
  it('volume with density (UNT-07..10)', () => {
    expect(g(1, 'cup', f)).toBeCloseTo(120, 9);
    expect(g(2.5, 'cup', f)).toBeCloseTo(300, 9);
    expect(g(1, 'tbsp', f)).toBeCloseTo(7.5, 9);
    expect(g(1, 'tsp', f)).toBeCloseTo(2.5, 9);
  });
  it('water: 250 ml at 1 g/ml (UNT-13)', () => {
    expect(g(250, 'ml', { gramsPerCup: 236.5882365 })).toBeCloseTo(250, 9);
  });
  it('volume without density is a typed error (UNT-12, UNT-19)', () => {
    expect(toGrams(1, 'cup')).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'cup' },
    });
    expect(toGrams(1, 'ml', { gramsPerCup: null }).ok).toBe(false);
    expect(toGrams(1, 'ml', { gramsPerCup: 0 }).ok).toBe(false);
  });
  it('each needs a weight (UNT-15)', () => {
    expect(toGrams(2, 'each')).toEqual({
      ok: false,
      error: { code: 'missingEachWeight', unit: 'each' },
    });
    expect(g(2, 'each', { gramsPerEach: 50 })).toBe(100);
  });
  it('zero allowed, negative/NaN/Infinity rejected (UNT-18)', () => {
    expect(g(0, 'g')).toBe(0);
    for (const bad of [-5, NaN, Infinity]) {
      expect(toGrams(bad, 'g')).toEqual({
        ok: false,
        error: { code: 'invalidAmount', amount: bad },
      });
    }
  });
});

describe('fromGrams and round trips', () => {
  it('1000 g to oz (UNT-06) and 300 g to cups (UNT-11)', () => {
    const oz = fromGrams(1000, 'oz');
    expect(oz.ok && oz.value).toBeCloseTo(35.27396195, 8);
    const cups = fromGrams(300, 'cup', f);
    expect(cups.ok && cups.value).toBeCloseTo(2.5, 9);
  });
  it('16 oz = 1 lb, 1 l = 1000 ml (UNT-04, UNT-14)', () => {
    expect(g(16, 'oz') / g(1, 'lb')).toBeCloseTo(1, 12);
    expect(ML_PER_UNIT.l / ML_PER_UNIT.ml).toBe(1000);
  });
  it('density required to go to volume (UNT-12)', () => {
    expect(fromGrams(100, 'cup')).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'cup' },
    });
  });
  it('round trips within 1e-9 (UNT-17)', () => {
    const units: Unit[] = [
      'g',
      'kg',
      'oz',
      'lb',
      'ml',
      'l',
      'tsp',
      'tbsp',
      'cup',
      'floz',
      'qt',
      'gal',
      'each',
    ];
    const fac = { gramsPerCup: 125, gramsPerEach: 55 };
    for (const u of units) {
      const back = fromGrams(g(3.7, u, fac), u, fac);
      expect(back.ok && back.value).toBeCloseTo(3.7, 9);
    }
  });
});

describe('misc', () => {
  it('US customary ratios', () => {
    expect(ML_PER_UNIT.tbsp * 16).toBeCloseTo(ML_PER_UNIT.cup, 12);
    expect(ML_PER_UNIT.tsp * 48).toBeCloseTo(ML_PER_UNIT.cup, 12);
    expect(ML_PER_UNIT.gal).toBeCloseTo(ML_PER_UNIT.cup * 16, 9);
  });
  it('dimension and isUnit', () => {
    expect(unitDimension('lb')).toBe('mass');
    expect(unitDimension('tsp')).toBe('volume');
    expect(unitDimension('each')).toBe('count');
    expect(isUnit('floz')).toBe(true);
    expect(isUnit('toString')).toBe(false);
    expect(isUnit('stone')).toBe(false);
  });
  it('temperature', () => {
    expect(celsiusToFahrenheit(24)).toBeCloseTo(75.2, 9);
    expect(fahrenheitToCelsius(212)).toBe(100);
  });
});
