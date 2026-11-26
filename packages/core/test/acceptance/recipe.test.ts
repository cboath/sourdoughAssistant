/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: hydration, baker's percentages, levain split, scaling (core-cases sections 1 and 2). */
import { describe, expect, it } from 'vitest';
import {
  bakersPercentages,
  doughTotals,
  hydrationPct,
  scaleLines,
  splitLevain,
} from '../../src/recipe';
import { percent, CoreInvariantError } from '../../src/types';
import { deepFreeze, flour, levain, other, rHyd, salt, water } from './support/fixtures';

const lines = (xs: any[]) => xs as any;

describe('splitLevain (ADR 0007)', () => {
  it.each([
    [100, 100, 50, 50],
    [100, 50, 66.66666666666667, 33.33333333333333],
    [100, 125, 44.44444444444444, 55.55555555555556],
    [100, 0, 100, 0],
  ])('splitLevain(%s g, %s%%)', (g, h, f, w) => {
    const r = splitLevain(g, h);
    expect(r.flourG).toBeCloseTo(f, 9);
    expect(r.waterG).toBeCloseTo(w, 9);
    expect(r.flourG + r.waterG).toBeCloseTo(g, 9);
  });
  it('defaults to 100% hydration', () =>
    expect(splitLevain(100)).toEqual({ flourG: 50, waterG: 50 }));
});

describe('doughTotals', () => {
  it('RCP-01 totals for R-HYD', () => {
    expect(doughTotals(rHyd())).toEqual({
      addedFlourG: 500,
      addedWaterG: 375,
      levainFlourG: 50,
      levainWaterG: 50,
      totalFlourG: 550,
      totalWaterG: 425,
      totalDoughG: 985,
    });
  });
});

describe('hydration (R-3, M1.1)', () => {
  // [id, lines, expectedUnrounded, expectedDisplay]
  const table: [string, any[], number, number][] = [
    ['RCP-01 PRD example', rHyd(), (425 / 550) * 100, 77.3],
    ['RCP-03 no levain', [flour('f', 500), water('w', 375), salt('s', 10)], 75, 75],
    ['RCP-04 stiff levain 50%', rHyd(50), ((375 + 100 / 3) / (500 + 200 / 3)) * 100, 72.1],
    ['RCP-05 wet levain 125%', rHyd(125), ((375 + 500 / 9) / (500 + 400 / 9)) * 100, 79.1],
    ['RCP-06 levain 0% is all flour', rHyd(0), 62.5, 62.5],
    [
      'RCP-07 bread + whole wheat',
      [flour('b', 450), flour('ww', 50), water('w', 375), levain('l', 100), salt('s', 10)],
      (425 / 550) * 100,
      77.3,
    ],
    [
      'RCP-08 inclusions excluded',
      [...rHyd(), other('cheese', 100, 'inclusion')],
      (425 / 550) * 100,
      77.3,
    ],
    [
      'RCP-09 role other (milk) excluded',
      [...rHyd(), other('milk', 50, 'other')],
      (425 / 550) * 100,
      77.3,
    ],
    ['RCP-12 half boundary 309/400', [flour('f', 400), water('w', 309)], 77.25, 77.3],
  ];
  it.each(table)('%s', (_id, ls, exact, shown) => {
    const h = hydrationPct(lines(ls));
    expect(h).not.toBeNull();
    expect(h as number).toBeCloseTo(exact, 9);
    expect(percent(h as number, 100, 1)).toBe(shown);
  });

  it('RCP-10 zero total flour is null, never NaN or Infinity, never throws', () => {
    expect(hydrationPct(lines([water('w', 100)]))).toBeNull();
    expect(hydrationPct(lines([]))).toBeNull();
  });
});

describe("baker's percentages (AMB-14)", () => {
  it('RCP-02 totalFlour basis: whole levain row, 1 dp display', () => {
    const r = bakersPercentages(lines(rHyd()));
    expect(r.basis).toBe('totalFlour');
    expect(r.baseFlourG).toBe(550);
    const byId = Object.fromEntries(r.rows.map((x) => [x.lineId, x.pct as number]));
    expect(percent(byId.flour!, 100)).toBe(90.9);
    expect(percent(byId.water!, 100)).toBe(68.2);
    expect(percent(byId.salt!, 100)).toBe(1.8);
    expect(percent(byId.levain!, 100)).toBe(18.2);
    expect(r.hydrationPct as number).toBeCloseTo(77.2727272727, 8);
  });
  it('RCP-08 inclusion is a share of total flour', () => {
    const r = bakersPercentages(lines([...rHyd(), other('cheese', 100, 'inclusion')]));
    expect(percent(r.rows.find((x) => x.lineId === 'cheese')!.pct as number, 100)).toBe(18.2);
  });
  it('addedFlour basis: flour lines = 100%, hydration still on total flour and water', () => {
    const r = bakersPercentages(lines(rHyd()), 'addedFlour');
    expect(r.baseFlourG).toBe(500);
    const byId = Object.fromEntries(r.rows.map((x) => [x.lineId, x.pct as number]));
    expect(byId.flour).toBeCloseTo(100, 9);
    expect(byId.water).toBeCloseTo(75, 9);
    expect(byId.salt).toBeCloseTo(2, 9);
    expect(byId.levain).toBeCloseTo(20, 9);
    expect(r.hydrationPct as number).toBeCloseTo(77.2727272727, 8);
  });
  it('RCP-10 zero flour gives null percentages, not NaN', () => {
    const r = bakersPercentages(lines([water('w', 100)]));
    expect(r.rows.every((x) => x.pct === null)).toBe(true);
    expect(r.hydrationPct).toBeNull();
  });
});

describe('scaleLines (R-4, AMB-13)', () => {
  const amounts = (r: any) => Object.fromEntries(r.lines.map((l: any) => [l.id, l.amountG]));

  it.each([
    ['SCL-01 double', 1, 2, { flour: 1000, water: 750, salt: 20, levain: 200 }],
    ['SCL-02 triple', 1, 3, { flour: 1500, water: 1125, salt: 30, levain: 300 }],
    ['SCL-03 identity', 1, 1, { flour: 500, water: 375, salt: 10, levain: 100 }],
    ['SCL-08 half loaf (187.5 rounds up)', 1, 0.5, { flour: 250, water: 188, salt: 5, levain: 50 }],
    ['SCL-10 100 loaves', 1, 100, { flour: 50000, water: 37500, salt: 1000, levain: 10000 }],
  ])('%s', (_id, from, to, expected) => {
    const r = scaleLines(lines(rHyd()), { by: 'loaves', fromLoaves: from, toLoaves: to });
    expect(r.factor).toBeCloseTo(to / from, 12);
    expect(amounts(r)).toEqual(expected);
    expect(r.totalG).toBe(Object.values(expected).reduce((a, b) => a + b, 0));
    expect(r.lines.find((l) => l.id === 'levain')!.levainHydrationPct).toBe(100);
  });

  it('SCL-04 2.5 g rounds half up to 3 g', () => {
    const r = scaleLines(lines([salt('s', 10)]), { by: 'factor', factor: 0.25 });
    expect(r.lines[0]!.amountG).toBe(3);
  });
  it('SCL-05 a non-zero amount never rounds to 0 (AMB-13)', () => {
    const r = scaleLines(lines([salt('s', 1), flour('f', 500), water('z', 0)]), {
      by: 'factor',
      factor: 0.4,
    });
    expect(amounts(r)).toEqual({ s: 1, f: 200, z: 0 });
  });
  it('SCL-06 target dough weight is per loaf, base is the sum of lines, rounded sum may miss the target', () => {
    const r = scaleLines(lines(rHyd()), { by: 'doughWeight', perLoafG: 1000, loaves: 1 });
    expect(r.factor).toBeCloseTo(1000 / 985, 12);
    expect(amounts(r)).toEqual({ flour: 508, water: 381, salt: 10, levain: 102 });
    expect(r.totalG).toBe(1001);
    expect(r.targetG).toBe(1000);
  });
  it('SCL-06b target is perLoafG x loaves', () => {
    const r = scaleLines(lines(rHyd()), { by: 'doughWeight', perLoafG: 500, loaves: 4 });
    expect(r.targetG).toBe(2000);
    expect(r.factor).toBeCloseTo(2000 / 985, 12);
  });
  it('SCL-07 hydration recomputed from the rounded lines', () => {
    const r = scaleLines(lines(rHyd()), { by: 'doughWeight', perLoafG: 1000, loaves: 1 });
    expect(hydrationPct(r.lines)).toBeCloseTo((432 / 559) * 100, 9);
    expect(percent(hydrationPct(r.lines)!, 100)).toBe(77.3);
  });
  it('SCL-07b hydration stays within 0.25 pp of the original for factors >= 1', () => {
    for (const f of [1, 1.1, 1.5, 2, 2.5, 3, 4, 5, 10]) {
      const r = scaleLines(lines(rHyd()), { by: 'factor', factor: f });
      expect(Math.abs(hydrationPct(r.lines)! - (425 / 550) * 100)).toBeLessThan(0.25);
    }
  });
  it('SCL-09 zero, negative and non-finite targets are programmer errors (CoreInvariantError)', () => {
    for (const t of [
      { by: 'factor', factor: 0 },
      { by: 'factor', factor: -1 },
      { by: 'factor', factor: Number.NaN },
      { by: 'loaves', fromLoaves: 0, toLoaves: 2 },
      { by: 'loaves', fromLoaves: 1, toLoaves: 0 },
    ] as const) {
      expect(() => scaleLines(lines(rHyd()), t as any)).toThrow(CoreInvariantError);
    }
  });
  it('SCL-11 scaling reads the base and never mutates it, so repeated scaling is not cumulative', () => {
    const base = deepFreeze(rHyd());
    const direct = scaleLines(base, { by: 'loaves', fromLoaves: 1, toLoaves: 3 });
    scaleLines(base, { by: 'loaves', fromLoaves: 1, toLoaves: 2 });
    expect(scaleLines(base, { by: 'loaves', fromLoaves: 1, toLoaves: 3 })).toEqual(direct);
    expect(base[0]!.amountG).toBe(500);
  });
  it('SCL-12 precisionG option', () => {
    const r = scaleLines(
      lines([flour('f', 333)]),
      { by: 'factor', factor: 1.5 },
      { precisionG: 5 },
    );
    expect(r.lines[0]!.amountG).toBe(500); // 499.5 -> step 5 -> 500
  });
});
