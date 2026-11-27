import { describe, expect, it } from 'vitest';
import { CoreInvariantError } from '../types';
import {
  costBreakdown,
  lineCostCents,
  packageGrams,
  sellPriceCents,
  unitCostCentsPerGram,
  type CostLineInput,
  type PricedPackage,
} from './cost';

const BREAD: PricedPackage = { priceCents: 240, size: 1000, unit: 'g' };
const WW: PricedPackage = { priceCents: 350, size: 1000, unit: 'g' };
const SALT: PricedPackage = { priceCents: 100, size: 1000, unit: 'g' };
const WATER: PricedPackage = { priceCents: 0, size: 1000, unit: 'g' };

const prd = (loaves = 1): CostLineInput[] => [
  { lineId: 'bread', name: 'Bread flour', role: 'flour', amountG: 450 * loaves, pantry: BREAD },
  { lineId: 'ww', name: 'Whole wheat', role: 'flour', amountG: 50 * loaves, pantry: WW },
  { lineId: 'salt', name: 'Salt', role: 'salt', amountG: 10 * loaves, pantry: SALT },
  {
    lineId: 'levain',
    name: 'Levain',
    role: 'levain',
    amountG: 100 * loaves,
    levainHydrationPct: 100,
    pantry: BREAD,
  },
  { lineId: 'water', name: 'Water', role: 'water', amountG: 375 * loaves, pantry: WATER },
];

describe('lineCostCents', () => {
  it('CST-01 per line', () => {
    expect(lineCostCents(450, BREAD)).toEqual({ ok: true, value: 108 });
    expect(lineCostCents(50, WW)).toEqual({ ok: true, value: 18 }); // 17.5 half up
    expect(lineCostCents(10, SALT)).toEqual({ ok: true, value: 1 });
  });
  it('CST-04 unit cost is not rounded first', () => {
    // 5 lb bag priced so the unit cost is 0.239859 c/g (543.99 c ~ 544 c): 450 g -> 108
    const bag: PricedPackage = { priceCents: 544, size: 5, unit: 'lb' };
    const l = lineCostCents(450, bag);
    expect(l).toEqual({ ok: true, value: 108 });
    const u = unitCostCentsPerGram(bag);
    expect(u.ok && u.value).toBeCloseTo(0.2398, 3);
  });
  it('CST-10 water priced', () => {
    expect(lineCostCents(425, { priceCents: 1, size: 1000, unit: 'g' })).toEqual({
      ok: true,
      value: 0,
    }); // 0.425
    expect(lineCostCents(425, { priceCents: 2, size: 1000, unit: 'g' })).toEqual({
      ok: true,
      value: 1,
    }); // 0.85
  });
  it('CST-11 zero price, CST-12 size 0, CST-13 negative price', () => {
    expect(lineCostCents(100, WATER)).toEqual({ ok: true, value: 0 });
    expect(lineCostCents(100, { ...BREAD, size: 0 }).ok).toBe(false);
    expect(lineCostCents(100, { ...BREAD, priceCents: -100 }).ok).toBe(false);
    expect(lineCostCents(-1, BREAD).ok).toBe(false);
  });
  it('CST-16 large values stay exact', () => {
    expect(lineCostCents(1, { priceCents: 99_999_999, size: 1, unit: 'g' })).toEqual({
      ok: true,
      value: 99_999_999,
    });
  });
  it('CST-17 cup line, CST-18 mixed units', () => {
    // 2 cups at 120 g/cup = 240 g -> 57.6 -> 58
    const cupG = 2 * 120;
    expect(lineCostCents(cupG, BREAD)).toEqual({ ok: true, value: 58 });
    // package in lb, line given in oz converted to grams by caller
    expect(lineCostCents(16 * 28.349523125, { priceCents: 453, size: 1, unit: 'lb' })).toEqual({
      ok: true,
      value: 453,
    });
  });
  it('volume package without density is a conversion error (UNT-19)', () => {
    expect(lineCostCents(30, { priceCents: 800, size: 1, unit: 'l' })).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'l' },
    });
  });
  it('UNT-16 volume package with density', () => {
    // 1 L oil, density 0.92 g/ml -> gramsPerCup = 0.92 * 236.5882365 ; 27.6 g costs 3% of the bottle
    const oil: PricedPackage = {
      priceCents: 1000,
      size: 1,
      unit: 'l',
      gramsPerCup: 0.92 * 236.5882365,
    };
    const pg = packageGrams(oil);
    expect(pg.ok && pg.value).toBeCloseTo(920, 6);
    expect(lineCostCents(27.6, oil)).toEqual({ ok: true, value: 30 });
  });
});

describe('costBreakdown', () => {
  it('CST-01/02/03 PRD anchor: 139 cents per loaf', () => {
    const b = costBreakdown(prd(), 1);
    expect(b.lines.map((l) => l.costCents)).toEqual([108, 18, 1, 12, 0]);
    expect(b.batchCents).toBe(139);
    expect(b.perLoafCents).toBe(139);
    expect(b.complete).toBe(true);
    expect(b.incompleteLineIds).toEqual([]);
  });
  it('levain is billed for its flour part only (ADR 0007)', () => {
    const lv = costBreakdown(prd(), 1).lines.find((l) => l.lineId === 'levain');
    expect(lv?.billedG).toBe(50);
  });
  it('water is free, not unpriced', () => {
    const w = costBreakdown(prd(), 1).lines.find((l) => l.lineId === 'water');
    expect(w?.status).toBe('free');
    expect(w?.costCents).toBe(0);
    expect(w?.sharePct).toBe(0);
  });
  it('CST-05 shares', () => {
    const shares = costBreakdown(prd(), 1).lines.map(
      (l) => Math.round((l.sharePct as number) * 10) / 10,
    );
    expect(shares).toEqual([77.7, 12.9, 0.7, 8.6, 0]);
  });
  it('CST-06/07/08 multi-loaf', () => {
    const two = costBreakdown(prd(2), 2);
    expect(two.lines.map((l) => l.costCents)).toEqual([216, 35, 2, 24, 0]);
    expect(two.batchCents).toBe(277);
    expect(two.perLoafCents).toBe(139); // 138.5 half up
    const three = costBreakdown(prd(3), 3);
    expect(three.lines.map((l) => l.costCents)).toEqual([324, 53, 3, 36, 0]);
    expect(three.batchCents).toBe(416);
    expect(three.perLoafCents).toBe(139);
    const four = costBreakdown(prd(4), 4);
    expect(four.batchCents).toBe(554);
    expect(four.perLoafCents).toBe(139);
  });
  it('CST-09 sub-cent lines flag belowOneCent', () => {
    const lines: CostLineInput[] = Array.from({ length: 5 }, (_, i) => ({
      lineId: `s${i}`,
      name: 'Salt',
      role: 'salt' as const,
      amountG: 4,
      pantry: { priceCents: 100, size: 1000, unit: 'g' as const },
    }));
    const b = costBreakdown(lines, 1);
    expect(b.batchCents).toBe(0);
    expect(b.lines.every((l) => l.belowOneCent && l.costCents === 0)).toBe(true);
    expect(b.lines[0]?.sharePct).toBeNull();
  });
  it('CST-15 unpriced and conversion errors make it incomplete, never a silent zero', () => {
    const lines = prd();
    lines[2] = { ...lines[2]!, pantry: null };
    lines[1] = { ...lines[1]!, pantry: { priceCents: 350, size: 1, unit: 'l' } };
    const b = costBreakdown(lines, 1);
    expect(b.complete).toBe(false);
    expect(b.incompleteLineIds).toEqual(['ww', 'salt']);
    expect(b.lines[1]).toMatchObject({
      status: 'conversionError',
      costCents: null,
      conversionError: { code: 'missingDensity' },
    });
    expect(b.lines[2]).toMatchObject({ status: 'unpriced', costCents: null });
    expect(b.batchCents).toBe(108 + 12);
  });
  it('levain without a pantry item is unpriced', () => {
    const lines = prd();
    lines[3] = { ...lines[3]!, pantry: null };
    expect(costBreakdown(lines, 1).incompleteLineIds).toEqual(['levain']);
  });
  it('CST-14 loaves must be > 0', () => {
    expect(() => costBreakdown(prd(), 0)).toThrow(CoreInvariantError);
  });
  it('CST-19 price change', () => {
    const lines = prd();
    lines[0] = { ...lines[0]!, pantry: { priceCents: 1500, size: 5000, unit: 'g' } };
    lines[3] = { ...lines[3]!, pantry: { priceCents: 1500, size: 5000, unit: 'g' } };
    const b = costBreakdown(lines, 1);
    expect(b.lines.map((l) => l.costCents)).toEqual([135, 18, 1, 15, 0]);
    expect(b.batchCents).toBe(169);
  });
  it('empty recipe', () => {
    const b = costBreakdown([], 2);
    expect(b).toMatchObject({ batchCents: 0, perLoafCents: 0, complete: true });
  });
});

describe('sellPriceCents', () => {
  it('CST-22/23/25', () => {
    expect(sellPriceCents(139, 1, 0)).toBe(139);
    expect(sellPriceCents(139, 1, 10000)).toBe(278);
    expect(sellPriceCents(139, 1, 3330)).toBe(185);
  });
  it('CST-24 uses the unrounded per-loaf cost (AMB-02)', () => {
    // 277 c / 2 loaves = 138.5 ; x1.5 = 207.75 -> 208
    expect(sellPriceCents(277, 2, 5000)).toBe(208);
  });
  it('default markup 200% (3x)', () => {
    expect(sellPriceCents(139, 1, 20000)).toBe(417);
  });
  it('rounding up to a step', () => {
    expect(sellPriceCents(139, 1, 20000, { mode: 'up', stepCents: 25 })).toBe(425);
    expect(sellPriceCents(150, 1, 0, { mode: 'up', stepCents: 25 })).toBe(150);
    expect(sellPriceCents(139, 1, 0, { mode: 'none' })).toBe(139);
    expect(() => sellPriceCents(139, 1, 0, { mode: 'up', stepCents: 0 })).toThrow(
      CoreInvariantError,
    );
  });
  it('CST-26 negative markup clamps to 0, loaves 0 throws', () => {
    expect(sellPriceCents(139, 1, -1000)).toBe(139);
    expect(() => sellPriceCents(139, 0, 0)).toThrow(CoreInvariantError);
  });
});

describe('SEC-M3-01: unusable results are invalidAmount, never Infinity or NaN', () => {
  const pkg = (size: number, priceCents = 240): PricedPackage => ({ priceCents, size, unit: 'g' });

  it('a 1e-300 package gives invalidAmount for the line, the unit cost and the breakdown', () => {
    const tiny = pkg(1e-300);
    const line = lineCostCents(450, tiny);
    expect(line.ok).toBe(false);
    if (!line.ok) expect(line.error.code).toBe('invalidAmount');
    expect(unitCostCentsPerGram(tiny).ok).toBe(false);
    const b = costBreakdown(
      [{ lineId: 'a', name: 'Flour', role: 'flour', amountG: 450, pantry: tiny }],
      1,
    );
    expect(b.lines[0]?.status).toBe('conversionError');
    expect(b.lines[0]?.conversionError?.code).toBe('invalidAmount');
    expect(b.lines[0]?.costCents).toBeNull();
    expect(b.complete).toBe(false);
    expect(Number.isFinite(b.batchCents)).toBe(true);
    expect(Number.isNaN(b.perLoafCents)).toBe(false);
  });

  it('a 1e-9 package would pass 2^53 cents, so it is invalidAmount', () => {
    const r = lineCostCents(50_000, pkg(1e-9, 100_000_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalidAmount');
  });

  it('the largest allowed values still cost normally', () => {
    // Smallest package (0.01 g) at the highest price (1,000,000 major units) and a 50 kg line.
    const r = lineCostCents(50_000, pkg(0.01, 100_000_000));
    expect(r).toEqual({ ok: true, value: 500_000_000_000_000 });
    expect(r.ok && r.value <= Number.MAX_SAFE_INTEGER).toBe(true);
    // The largest package (1,000 kg).
    expect(lineCostCents(450, pkg(1_000_000, 100_000_000))).toEqual({ ok: true, value: 45_000 });
  });
});
