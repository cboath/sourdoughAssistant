import { describe, expect, it } from 'vitest';
import { CoreInvariantError, percent } from '../types';
import { hydrationPct, type IngredientLine } from './recipe';
import { scaleLines } from './scale';

const L = (
  id: string,
  role: IngredientLine['role'],
  amountG: number,
  h: number | null = null,
): IngredientLine => ({
  id,
  name: id,
  role,
  amountG,
  levainHydrationPct: h,
});
const rHyd = [
  L('flour', 'flour', 500),
  L('water', 'water', 375),
  L('salt', 'salt', 10),
  L('levain', 'levain', 100, 100),
];
const amounts = (r: { lines: IngredientLine[] }) => r.lines.map((l) => l.amountG);

describe('scaleLines', () => {
  it('SCL-01/02/03 loaves', () => {
    expect(amounts(scaleLines(rHyd, { by: 'loaves', fromLoaves: 1, toLoaves: 2 }))).toEqual([
      1000, 750, 20, 200,
    ]);
    expect(amounts(scaleLines(rHyd, { by: 'loaves', fromLoaves: 1, toLoaves: 3 }))).toEqual([
      1500, 1125, 30, 300,
    ]);
    expect(amounts(scaleLines(rHyd, { by: 'loaves', fromLoaves: 1, toLoaves: 1 }))).toEqual([
      500, 375, 10, 100,
    ]);
  });
  it('keeps ids, names, levain hydration', () => {
    const r = scaleLines(rHyd, { by: 'factor', factor: 2 });
    expect(r.lines.map((l) => l.id)).toEqual(['flour', 'water', 'salt', 'levain']);
    expect(r.lines[3]?.levainHydrationPct).toBe(100);
    expect(r.targetG).toBeNull();
    expect(r.totalG).toBe(1970);
  });
  it('SCL-04 half grams round up, SCL-08 scale down', () => {
    expect(amounts(scaleLines([L('s', 'salt', 10)], { by: 'factor', factor: 0.25 }))).toEqual([3]);
    expect(amounts(scaleLines(rHyd, { by: 'loaves', fromLoaves: 1, toLoaves: 0.5 }))).toEqual([
      250, 188, 5, 50,
    ]);
  });
  it('SCL-05 sub-gram never vanishes (AMB-13)', () => {
    expect(amounts(scaleLines([L('s', 'salt', 1)], { by: 'factor', factor: 0.4 }))).toEqual([1]);
    expect(amounts(scaleLines([L('s', 'salt', 0)], { by: 'factor', factor: 0.4 }))).toEqual([0]);
  });
  it('SCL-06/07 target dough weight', () => {
    const r = scaleLines(rHyd, { by: 'doughWeight', perLoafG: 1000, loaves: 1 });
    expect(r.factor).toBeCloseTo(1000 / 985, 12);
    expect(amounts(r)).toEqual([508, 381, 10, 102]);
    expect(r.totalG).toBe(1001);
    expect(r.targetG).toBe(1000);
    expect(percent(hydrationPct(r.lines) as number, 100)).toBe(77.3);
  });
  it('doughWeight target is per loaf times loaves', () => {
    const r = scaleLines(rHyd, { by: 'doughWeight', perLoafG: 985, loaves: 2 });
    expect(amounts(r)).toEqual([1000, 750, 20, 200]);
    expect(r.targetG).toBe(1970);
  });
  it('SCL-09 rejects zero, negative, NaN', () => {
    for (const factor of [0, -1, NaN]) {
      expect(() => scaleLines(rHyd, { by: 'factor', factor })).toThrow(CoreInvariantError);
    }
    expect(() => scaleLines(rHyd, { by: 'loaves', fromLoaves: 0, toLoaves: 1 })).toThrow(
      CoreInvariantError,
    );
  });
  it('SCL-10 large k', () => {
    expect(amounts(scaleLines(rHyd, { by: 'loaves', fromLoaves: 1, toLoaves: 100 }))).toEqual([
      50000, 37500, 1000, 10000,
    ]);
  });
  it('SCL-11 scaling from base is not cumulative', () => {
    const base = [L('s', 'salt', 7)];
    const direct = scaleLines(base, { by: 'loaves', fromLoaves: 1, toLoaves: 3 });
    const two = scaleLines(base, { by: 'loaves', fromLoaves: 1, toLoaves: 2 });
    const chained = scaleLines(two.lines, { by: 'loaves', fromLoaves: 2, toLoaves: 3 });
    expect(amounts(direct)).toEqual([21]);
    expect(amounts(chained)).toEqual([21]);
  });
  it('precisionG option', () => {
    expect(
      amounts(scaleLines([L('f', 'flour', 503)], { by: 'factor', factor: 1 }, { precisionG: 5 })),
    ).toEqual([505]);
  });
  it('does not mutate input', () => {
    const copy = JSON.parse(JSON.stringify(rHyd));
    scaleLines(rHyd, { by: 'factor', factor: 3 });
    expect(rHyd).toEqual(copy);
  });
});
