/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: cost in integer cents, sell price, money parsing and formatting (core-cases section 4, ADR 0006). */
import { describe, expect, it } from 'vitest';
import {
  costBreakdown,
  currencyMinorDigits,
  formatMoney,
  lineCostCents,
  packageGrams,
  parseMoneyInput,
  sellPriceCents,
  unitCostCentsPerGram,
} from '../../src/cost';
import { toGrams } from '../../src/units';
import { percent } from '../../src/types';
import { P_BREAD, P_BREAD_5LB, P_SALT, P_WATER, P_WW } from './support/fixtures';

const ok = (r: any) => {
  expect(r.ok).toBe(true);
  return r.value;
};

/** R-COST at a scale factor k (whole-number loaves). Levain 100 g at 100% bills its flour half. */
const rCost = (k: number) =>
  [
    { lineId: 'bread', name: 'Bread flour', role: 'flour', amountG: 450 * k, pantry: P_BREAD },
    { lineId: 'ww', name: 'Whole wheat', role: 'flour', amountG: 50 * k, pantry: P_WW },
    { lineId: 'salt', name: 'Salt', role: 'salt', amountG: 10 * k, pantry: P_SALT },
    {
      lineId: 'levain',
      name: 'Levain',
      role: 'levain',
      amountG: 100 * k,
      levainHydrationPct: 100,
      pantry: P_BREAD,
    },
    { lineId: 'water', name: 'Water', role: 'water', amountG: 375 * k, pantry: P_WATER },
  ] as any[];

describe('lineCostCents (round once per line, multiply before divide)', () => {
  it.each([
    ['CST-01 bread 450 g', 450, P_BREAD, 108],
    ['CST-01 whole wheat 50 g = 17.5 -> 18', 50, P_WW, 18],
    ['CST-01 salt 10 g', 10, P_SALT, 1],
    ['CST-01 levain flour 50 g', 50, P_BREAD, 12],
    ['CST-01 water 425 g', 425, P_WATER, 0],
    ['CST-04 5 lb bag, 450 g (107.94 -> 108)', 450, P_BREAD_5LB, 108],
    [
      'CST-10 water at 0.001 c/g, 425 g = 0.425 -> 0',
      425,
      { priceCents: 1, size: 1000, unit: 'g' },
      0,
    ],
    [
      'CST-10 water at 0.002 c/g, 425 g = 0.85 -> 1',
      425,
      { priceCents: 2, size: 1000, unit: 'g' },
      1,
    ],
    ['CST-11 zero price', 500, { priceCents: 0, size: 1000, unit: 'g' }, 0],
    ['CST-16 large price, exact', 1, { priceCents: 99_999_999, size: 1, unit: 'g' }, 99_999_999],
    ['CST-16b large price, half up', 1, { priceCents: 99_999_999, size: 1000, unit: 'g' }, 100_000],
    [
      'CST-19 price change 1500 c / 5000 g, bread',
      450,
      { priceCents: 1500, size: 5000, unit: 'g' },
      135,
    ],
  ])('%s', (_n, g, pkg, cents) => {
    expect(ok(lineCostCents(g, pkg as any))).toBe(cents);
  });

  it('CST-17 two cups at 120 g/cup = 240 g -> 57.6 -> 58', () => {
    expect(ok(lineCostCents(ok(toGrams(2, 'cup', { gramsPerCup: 120 })), P_BREAD))).toBe(58);
  });
  it('CST-18 oz line against a lb package: 16 oz = 1 lb = 544/5 = 108.8 -> 109', () => {
    expect(ok(lineCostCents(ok(toGrams(16, 'oz')), P_BREAD_5LB))).toBe(109);
  });
  it('CST-27 JPY (0 decimals): minor unit is the yen, no x100', () => {
    expect(ok(lineCostCents(250, { priceCents: 480, size: 1000, unit: 'g' }))).toBe(120);
  });
  it('packageGrams and unitCostCentsPerGram', () => {
    expect(ok(packageGrams(P_BREAD_5LB))).toBeCloseTo(2267.96185, 9);
    expect(ok(packageGrams({ priceCents: 1, size: 2, unit: 'cup', gramsPerCup: 120 }))).toBeCloseTo(
      240,
      9,
    );
    expect(ok(unitCostCentsPerGram(P_BREAD))).toBeCloseTo(0.24, 12);
    expect(ok(unitCostCentsPerGram(P_BREAD_5LB))).toBeCloseTo(544 / 2267.96185, 9);
  });
  it('UNT-19 volume package without density is a typed error, not a cost', () => {
    expect(lineCostCents(100, { priceCents: 100, size: 1, unit: 'cup' })).toEqual({
      ok: false,
      error: { code: 'missingDensity', unit: 'cup' },
    });
  });
  it.each([
    ['CST-12 package size 0', { priceCents: 100, size: 0, unit: 'g' }],
    ['CST-13 negative price', { priceCents: -100, size: 1000, unit: 'g' }],
  ])('%s never yields a non-finite ok value (PROPOSED: contract has no code for it)', (_n, pkg) => {
    let r: any;
    try {
      r = lineCostCents(10, pkg as any);
    } catch {
      return; // throwing is acceptable for a violated invariant
    }
    if (r.ok) expect(Number.isFinite(r.value) && r.value >= 0).toBe(true);
  });
});

describe('costBreakdown: PRD example', () => {
  const b = costBreakdown(rCost(1), 1);
  it('CST-01/02/03 per-line cents and 139 per loaf', () => {
    expect(b.lines.map((l) => [l.lineId, l.costCents])).toEqual([
      ['bread', 108],
      ['ww', 18],
      ['salt', 1],
      ['levain', 12],
      ['water', 0],
    ]);
    expect(b.batchCents).toBe(139); // sum of rounded lines; the unrounded sum would be 138.5
    expect(b.perLoafCents).toBe(139);
    expect(b.loaves).toBe(1);
    expect(b.complete).toBe(true);
    expect(b.incompleteLineIds).toEqual([]);
  });
  it('ADR 0007: levain bills its flour half only', () => {
    expect(b.lines.find((l) => l.lineId === 'levain')!.billedG).toBe(50);
    expect(b.lines.find((l) => l.lineId === 'bread')!.billedG).toBe(450);
  });
  it('CST-05 shares (unrounded in core, 1 dp on display)', () => {
    const share = (id: string) => b.lines.find((l) => l.lineId === id)!.sharePct as number;
    expect(share('bread')).toBeCloseTo((108 / 139) * 100, 9);
    expect(percent(share('bread'), 100)).toBe(77.7);
    expect(percent(share('ww'), 100)).toBe(12.9);
    expect(percent(share('salt'), 100)).toBe(0.7);
    expect(percent(share('levain'), 100)).toBe(8.6);
    expect(share('water')).toBe(0);
  });
  it('water is free, not unpriced (C-5)', () => {
    const w = b.lines.find((l) => l.lineId === 'water')!;
    expect(w.status).toBe('free');
    expect(w.costCents).toBe(0);
    expect(w.belowOneCent).toBe(false);
  });
  it('lines are priced', () =>
    expect(b.lines.find((l) => l.lineId === 'bread')!.status).toBe('priced'));
});

describe('costBreakdown: batches (AMB-01, AMB-02)', () => {
  // [id, loaves, line cents, batch, perLoaf]
  it.each([
    ['CST-06 2 loaves (277/2 = 138.5 -> 139)', 2, [216, 35, 2, 24, 0], 277, 139],
    ['CST-07 3 loaves (WW 52.5 -> 53; 416/3 = 138.67 -> 139)', 3, [324, 53, 3, 36, 0], 416, 139],
    ['CST-08 4 loaves (554/4 = 138.5 -> 139)', 4, [432, 70, 4, 48, 0], 554, 139],
  ])('%s', (_n, k, cents, batch, perLoaf) => {
    const b = costBreakdown(rCost(k), k);
    expect(b.lines.map((l) => l.costCents)).toEqual(cents);
    expect(b.batchCents).toBe(batch);
    expect(b.perLoafCents).toBe(perLoaf);
  });

  it('CST-09 sub-cent lines: round once per line, flagged belowOneCent, drift accepted', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      lineId: `s${i}`,
      name: 'Salt',
      role: 'salt',
      amountG: 4,
      pantry: P_SALT,
    })) as any[];
    const b = costBreakdown(five, 1);
    expect(b.lines.every((l) => l.costCents === 0 && l.belowOneCent && l.status === 'priced')).toBe(
      true,
    );
    expect(b.batchCents).toBe(0);
    expect(b.perLoafCents).toBe(0);
    expect(b.lines.every((l) => l.sharePct === null)).toBe(true); // batch 0: no share
  });

  it('CST-15 unpriced line: partial cost, named, never a silent 0', () => {
    const ls = rCost(1);
    ls[1].pantry = null;
    const b = costBreakdown(ls, 1);
    const ww = b.lines.find((l) => l.lineId === 'ww')!;
    expect(ww.status).toBe('unpriced');
    expect(ww.costCents).toBeNull();
    expect(ww.sharePct).toBeNull();
    expect(b.complete).toBe(false);
    expect(b.incompleteLineIds).toEqual(['ww']);
    expect(b.batchCents).toBe(121); // 139 - 18
  });
  it('UNT-19 conversion error line is flagged and carries the typed error', () => {
    const ls = rCost(1);
    ls[2].pantry = { priceCents: 100, size: 1, unit: 'cup' }; // salt priced per cup, no density
    const b = costBreakdown(ls, 1);
    const s = b.lines.find((l) => l.lineId === 'salt')!;
    expect(s.status).toBe('conversionError');
    expect(s.costCents).toBeNull();
    expect(s.conversionError).toEqual({ code: 'missingDensity', unit: 'cup' });
    expect(b.complete).toBe(false);
    expect(b.incompleteLineIds).toEqual(['salt']);
  });
  it('CST-19 price change updates the recipe cost to 169', () => {
    const ls = rCost(1).map((l) =>
      l.pantry === P_BREAD ? { ...l, pantry: { priceCents: 1500, size: 5000, unit: 'g' } } : l,
    );
    const b = costBreakdown(ls, 1);
    expect(b.lines.map((l) => l.costCents)).toEqual([135, 18, 1, 15, 0]);
    expect(b.batchCents).toBe(169);
  });
  it('CST-14 loaves <= 0 never yields Infinity or NaN (PROPOSED: throw or finite)', () => {
    let b: any;
    try {
      b = costBreakdown(rCost(1), 0);
    } catch {
      return;
    }
    expect(Number.isFinite(b.perLoafCents)).toBe(true);
  });
  it('purity: same input, same output, input untouched', () => {
    const ls = rCost(1);
    const snap = JSON.stringify(ls);
    expect(costBreakdown(ls, 1)).toEqual(costBreakdown(ls, 1));
    expect(JSON.stringify(ls)).toBe(snap);
  });
});

describe('sellPriceCents (AMB-02, AMB-03: markup on cost, from unrounded per-loaf cost)', () => {
  it.each([
    ['CST-22 0% markup', 139, 1, 0, undefined, 139],
    ['CST-23 100% markup', 139, 1, 10_000, undefined, 278],
    ['CST-24a 50% markup, 1 loaf: 208.5 -> 209', 139, 1, 5_000, undefined, 209],
    [
      'CST-24b 50% markup, batch 277 / 2 loaves from UNROUNDED cost: 207.75 -> 208 (not 209)',
      277,
      2,
      5_000,
      undefined,
      208,
    ],
    ['CST-25 33.3% markup: 185.287 -> 185', 139, 1, 3_330, undefined, 185],
    ['ADR 0006 default 200% markup (3x)', 139, 1, 20_000, undefined, 417],
    ['rounding none = half up', 139, 1, 5_000, { mode: 'none' }, 209],
    ['rounding up to 25c: 185 -> 200', 139, 1, 3_330, { mode: 'up', stepCents: 25 }, 200],
    [
      'rounding up leaves an exact multiple alone',
      100,
      1,
      10_000,
      { mode: 'up', stepCents: 25 },
      200,
    ],
    ['rounding up to 5c: 186 -> 190', 93, 1, 10_000, { mode: 'up', stepCents: 5 }, 190],
  ])('%s', (_n, batch, loaves, bps, rounding, expected) => {
    expect(sellPriceCents(batch, loaves, bps, rounding as any)).toBe(expected);
  });
  it('CST-26 negative markup is rejected or clamped to 0% (PROPOSED: core-api is silent)', () => {
    let v: number | undefined;
    try {
      v = sellPriceCents(139, 1, -1000);
    } catch {
      return;
    }
    expect(v).toBe(139);
  });
});

describe('money parsing (MNY, AMB-15): integer cents, never dollars * 100', () => {
  it.each([
    ['MNY-01', '19.99', 'USD', 'en-US', 1999],
    ['MNY-02', '4.35', 'USD', 'en-US', 435],
    ['MNY-03', '0.29', 'USD', 'en-US', 29],
    ['MNY-04', '1.15', 'USD', 'en-US', 115],
    ['MNY-05', '$12', 'USD', 'en-US', 1200],
    ['MNY-06', '1,234.50', 'USD', 'en-US', 123450],
    ['MNY-09', '1.234,50', 'EUR', 'de-DE', 123450],
    ['MNY-10', '1,5', 'EUR', 'de-DE', 150],
    ['MNY-11', '¥1200', 'JPY', 'ja-JP', 1200],
    ['MNY-12 KWD 3 digits', '1.234', 'KWD', 'en-US', 1234],
    ['MNY-13 zero', '0', 'USD', 'en-US', 0],
  ])('%s parses %s', (_id, text, cur, loc, cents) => {
    expect(parseMoneyInput(text, cur, loc)).toEqual({ ok: true, value: cents });
  });
  it.each([
    ['MNY-07 3 decimals rejected, not rounded', '1.005', 'USD', 'en-US', 'tooManyDecimals', 2],
    ['MNY-14 JPY decimals rejected', '12.5', 'JPY', 'ja-JP', 'tooManyDecimals', 0],
    ['MNY-15 KWD 4 decimals rejected', '1.2345', 'KWD', 'en-US', 'tooManyDecimals', 3],
    ['MNY-08a empty', '', 'USD', 'en-US', 'empty', undefined],
    ['MNY-08b whitespace only', '   ', 'USD', 'en-US', 'empty', undefined],
    ['MNY-08c letters', 'abc', 'USD', 'en-US', 'notANumber', undefined],
    ['MNY-08d negative', '-1', 'USD', 'en-US', 'negative', undefined],
    ['MNY-08e exponent', '1e3', 'USD', 'en-US', 'notANumber', undefined],
  ])('%s', (_id, text, cur, loc, code, maxDecimals) => {
    const r: any = parseMoneyInput(text, cur, loc);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe(code);
    if (maxDecimals !== undefined) expect(r.error.maxDecimals).toBe(maxDecimals);
  });
});

describe('money formatting (display only; Intl on Node, re-check once on Hermes)', () => {
  it('currencyMinorDigits', () => {
    expect(currencyMinorDigits('USD')).toBe(2);
    expect(currencyMinorDigits('EUR')).toBe(2);
    expect(currencyMinorDigits('JPY')).toBe(0);
    expect(currencyMinorDigits('KWD')).toBe(3);
  });
  it('FMT-01/04/05 en-US USD', () => {
    expect(formatMoney(139, 'USD', 'en-US')).toBe('$1.39');
    expect(formatMoney(0, 'USD', 'en-US')).toBe('$0.00');
    expect(formatMoney(99_999_999, 'USD', 'en-US')).toBe('$999,999.99');
  });
  it('FMT-02 de-DE EUR matches the platform output (NBSP)', () => {
    expect(formatMoney(139, 'EUR', 'de-DE')).toBe(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1.39),
    );
    expect(formatMoney(139, 'EUR', 'de-DE')).toMatch(/1,39/);
  });
  it('FMT-03 JPY shows 139 yen, not 1.39', () => {
    const s = formatMoney(139, 'JPY', 'ja-JP');
    expect(s).toMatch(/139/);
    expect(s).not.toMatch(/1\.39/);
  });
  it('KWD three digits', () => expect(formatMoney(1234, 'KWD', 'en-US')).toMatch(/1\.234/));
});
