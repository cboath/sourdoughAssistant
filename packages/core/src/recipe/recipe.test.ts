import { describe, expect, it } from 'vitest';
import { percent } from '../types';
import {
  bakersPercentages,
  doughTotals,
  hydrationPct,
  splitLevain,
  type IngredientLine,
} from './recipe';

export const L = (
  id: string,
  role: IngredientLine['role'],
  amountG: number,
  levainHydrationPct: number | null = null,
): IngredientLine => ({ id, name: id, role, amountG, levainHydrationPct });

// R-HYD: PRD example
const rHyd = [
  L('flour', 'flour', 500),
  L('water', 'water', 375),
  L('salt', 'salt', 10),
  L('levain', 'levain', 100, 100),
];
const withLevain = (h: number) =>
  rHyd.map((l) => (l.role === 'levain' ? { ...l, levainHydrationPct: h } : l));

describe('splitLevain', () => {
  it('100 g at 100% is 50 + 50', () => {
    expect(splitLevain(100)).toEqual({ flourG: 50, waterG: 50 });
  });
  it('stiff and wet', () => {
    const s = splitLevain(100, 50);
    expect(s.flourG).toBeCloseTo(66.6667, 4);
    expect(s.waterG).toBeCloseTo(33.3333, 4);
    expect(splitLevain(100, 0)).toEqual({ flourG: 100, waterG: 0 });
  });
});

describe('hydration (RCP)', () => {
  it('RCP-01 PRD example', () => {
    const t = doughTotals(rHyd);
    expect(t.totalFlourG).toBe(550);
    expect(t.totalWaterG).toBe(425);
    expect(t.totalDoughG).toBe(985);
    const h = hydrationPct(rHyd) as number;
    expect(h).toBeCloseTo(77.2727, 4);
    expect(percent(h, 100)).toBe(77.3);
  });
  it('RCP-03 no levain', () => {
    expect(hydrationPct([L('f', 'flour', 500), L('w', 'water', 375), L('s', 'salt', 10)])).toBe(75);
  });
  it('RCP-04/05/06 levain hydration variants', () => {
    expect(hydrationPct(withLevain(50))).toBeCloseTo(72.0588, 4);
    expect(hydrationPct(withLevain(125))).toBeCloseTo(79.0816, 4);
    expect(hydrationPct(withLevain(0))).toBe(62.5);
  });
  it('RCP-07 whole wheat plus bread flour', () => {
    const lines = [
      L('b', 'flour', 450),
      L('ww', 'flour', 50),
      L('w', 'water', 375),
      L('lv', 'levain', 100, 100),
      L('s', 'salt', 10),
    ];
    expect(percent(hydrationPct(lines) as number, 100)).toBe(77.3);
  });
  it('RCP-08/09 inclusions and other are excluded', () => {
    const plus = [...rHyd, L('cheese', 'inclusion', 100), L('milk', 'other', 50)];
    expect(percent(hydrationPct(plus) as number, 100)).toBe(77.3);
  });
  it('RCP-10 zero flour is null, never NaN', () => {
    expect(hydrationPct([L('w', 'water', 100)])).toBeNull();
    expect(hydrationPct([])).toBeNull();
  });
  it('missing levain hydration defaults to 100', () => {
    expect(hydrationPct([...rHyd.slice(0, 3), L('lv', 'levain', 100, null)])).toBeCloseTo(
      77.2727,
      4,
    );
  });
  it('multiple levain lines are summed', () => {
    const t = doughTotals([L('a', 'levain', 50, 100), L('b', 'levain', 50, 100)]);
    expect(t.levainFlourG).toBe(50);
    expect(t.levainWaterG).toBe(50);
  });
});

describe('bakersPercentages', () => {
  it('RCP-02/08 totalFlour basis, levain as whole line', () => {
    const r = bakersPercentages([...rHyd, L('cheese', 'inclusion', 100)]);
    const pct = (id: string) => percent(r.rows.find((x) => x.lineId === id)?.pct as number, 100);
    expect(r.baseFlourG).toBe(550);
    expect(pct('flour')).toBe(90.9);
    expect(pct('water')).toBe(68.2);
    expect(pct('salt')).toBe(1.8);
    expect(pct('levain')).toBe(18.2);
    expect(pct('cheese')).toBe(18.2);
    expect(percent(r.hydrationPct as number, 100)).toBe(77.3);
  });
  it('addedFlour basis', () => {
    const r = bakersPercentages(rHyd, 'addedFlour');
    expect(r.baseFlourG).toBe(500);
    expect(r.rows[0]?.pct).toBe(100);
    expect(r.rows[1]?.pct).toBe(75);
    expect(percent(r.hydrationPct as number, 100)).toBe(77.3); // still total-based
  });
  it('null pct when there is no flour', () => {
    const r = bakersPercentages([L('w', 'water', 100)]);
    expect(r.rows[0]?.pct).toBeNull();
    expect(r.hydrationPct).toBeNull();
  });
  it('RCP-12 half boundary', () => {
    expect(percent(309, 400)).toBe(77.3);
  });
});
