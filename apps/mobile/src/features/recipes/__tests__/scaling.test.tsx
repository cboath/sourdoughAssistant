/** QA-03: view-only scaling math (TC-RE-16, TC-RE-18). Pure, no rendering. */
import type { IngredientLine } from '@sourdough/core';
import { applyScale, differsFromRecipe, initialScale } from '../scaling';

const line = (id: string, role: IngredientLine['role'], amountG: number): IngredientLine => ({
  id,
  name: id,
  role,
  amountG,
  levainHydrationPct: role === 'levain' ? 100 : null,
});

// The PRD loaf: 500 g flour, 375 g water, 10 g salt, 100 g levain = 985 g.
const PRD = [
  line('bread', 'flour', 450),
  line('wheat', 'flour', 50),
  line('water', 'water', 375),
  line('salt', 'salt', 10),
  line('levain', 'levain', 100),
];

describe('initialScale', () => {
  it('starts at the recipe loaves and the per-loaf weight of the lines', () => {
    expect(initialScale({ yieldLoaves: 1, doughWeightG: null, lines: PRD })).toEqual({
      by: 'loaves',
      loaves: 1,
      perLoafG: 985,
    });
    expect(initialScale({ yieldLoaves: 2, doughWeightG: null, lines: PRD }).perLoafG).toBe(493);
  });

  it('prefers the recipe dough weight and a ?loaves= override', () => {
    expect(initialScale({ yieldLoaves: 1, doughWeightG: 900, lines: PRD, loaves: 3 })).toEqual({
      by: 'loaves',
      loaves: 3,
      perLoafG: 900,
    });
  });

  it('an empty recipe never produces a zero weight', () => {
    expect(initialScale({ yieldLoaves: 1, doughWeightG: null, lines: [] }).perLoafG).toBe(1);
  });
});

describe('applyScale', () => {
  const initial = initialScale({ yieldLoaves: 1, doughWeightG: null, lines: PRD });

  it('at the recipe scale returns the stored amounts untouched (2.5 g survives)', () => {
    const salty = [line('salt', 'salt', 2.5), ...PRD.slice(0, 2)];
    const start = initialScale({ yieldLoaves: 1, doughWeightG: null, lines: salty });
    const view = applyScale(salty, 1, start, start);
    expect(view.scaled).toBe(false);
    expect(view.lines.find((l) => l.id === 'salt')?.amountG).toBe(2.5);
    expect(view.factor).toBe(1);
  });

  it('by loaves: 1 -> 3 triples every line', () => {
    const view = applyScale(PRD, 1, { ...initial, loaves: 3 }, initial);
    expect(view.scaled).toBe(true);
    expect(view.factor).toBe(3);
    expect(view.lines.map((l) => l.amountG)).toEqual([1350, 150, 1125, 30, 300]);
    expect(view.totalG).toBe(2955);
    expect(view.targetG).toBeNull();
  });

  it('by loaves: 2 -> 1 halves a two-loaf recipe', () => {
    const two = PRD.map((l) => ({ ...l, amountG: l.amountG * 2 }));
    const start = initialScale({ yieldLoaves: 2, doughWeightG: null, lines: two });
    const view = applyScale(two, 2, { ...start, loaves: 1 }, start);
    expect(view.lines.map((l) => l.amountG)).toEqual(PRD.map((l) => l.amountG));
  });

  it('by dough weight: per-loaf x loaves is the target and the total lands within a gram or two', () => {
    const view = applyScale(PRD, 1, { by: 'doughWeight', loaves: 2, perLoafG: 1000 }, initial);
    expect(view.targetG).toBe(2000);
    expect(Math.abs(view.totalG - 2000)).toBeLessThanOrEqual(3);
    expect(view.factor).toBeCloseTo(2000 / 985, 4);
  });

  it('dough-weight mode at the recipe weight changes nothing', () => {
    const view = applyScale(PRD, 1, { by: 'doughWeight', loaves: 1, perLoafG: 985 }, initial);
    expect(view.scaled).toBe(false);
    expect(view.totalG).toBe(985);
  });

  it('no lines or no weight: nothing to scale', () => {
    expect(applyScale([], 1, { ...initial, loaves: 4 }, initial).scaled).toBe(false);
    expect(applyScale([line('w', 'water', 0)], 1, { ...initial, loaves: 4 }, initial).scaled).toBe(
      false,
    );
  });
});

describe('differsFromRecipe (shows Reset)', () => {
  const initial = { by: 'loaves' as const, loaves: 1, perLoafG: 985 };
  it('is false at the start and true after any change', () => {
    expect(differsFromRecipe(initial, initial, 1)).toBe(false);
    expect(differsFromRecipe({ ...initial, loaves: 2 }, initial, 1)).toBe(true);
    expect(differsFromRecipe({ ...initial, by: 'doughWeight' }, initial, 1)).toBe(true);
    expect(differsFromRecipe({ ...initial, perLoafG: 1000 }, initial, 1)).toBe(true);
  });
});
