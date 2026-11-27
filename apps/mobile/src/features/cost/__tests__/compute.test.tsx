import { doughTotals, percent } from '@sourdough/core';
import { SEED_CATALOG, SEED_DATE, SEED_EPOCH } from '../../../db/seed';
import type { PantryItem, RecipeIngredient } from '../../../db/types';
import { formatRatioPercent } from '../../recipes/format';
import { toLines } from '../../recipes/metrics';
import { computeCostView } from '../compute';

/** The seeded catalog as the repositories would return it. */
function seededPantry(): PantryItem[] {
  return SEED_CATALOG.pantry.map((p) => ({
    id: p.id,
    name: p.item.name,
    category: p.item.category ?? 'other',
    packagePriceCents: p.item.packagePriceCents ?? null,
    packageSize: p.item.packageSize ?? null,
    packageUnit: p.item.packageUnit ?? null,
    gramsPerCup: p.item.gramsPerCup ?? null,
    gramsPerEach: p.item.gramsPerEach ?? null,
    store: null,
    pricedAt: SEED_DATE,
    seedKey: p.seedKey,
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
    deletedAt: null,
  }));
}

function seededLoaf(): { ingredients: RecipeIngredient[]; pantry: PantryItem[] } {
  const seed = SEED_CATALOG.recipes.find((r) => r.seedKey === 'recipe:country-loaf');
  if (!seed) throw new Error('missing seed');
  const pantry = seededPantry();
  const ingredients = seed.ingredients.map((line, position) => ({
    id: line.id,
    recipeId: seed.id,
    pantryItemId: pantry.find((p) => p.seedKey === line.pantryKey)?.id ?? null,
    position,
    name: line.name,
    role: line.role,
    amountG: line.amountG,
    entryAmount: null,
    entryUnit: null,
    levainHydrationPct: line.levainHydrationPct ?? null,
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
    deletedAt: null,
  }));
  return { ingredients, pantry };
}

describe('seeded Country loaf (PRD section 4 and 6)', () => {
  const { ingredients, pantry } = seededLoaf();
  const base = {
    ingredients,
    pantryItems: pantry,
    yieldLoaves: 1,
    markupBps: 20000,
    sellRoundingCents: 0,
  };

  it('shows 77.3% hydration including the levain', () => {
    const totals = doughTotals(toLines(ingredients));
    expect(percent(totals.totalWaterG, totals.totalFlourG)).toBe(77.3);
    expect(formatRatioPercent(totals.totalWaterG, totals.totalFlourG, 'en-US')).toBe('77.3%');
  });

  it('costs $1.39 per loaf with a $4.17 suggested price', () => {
    const view = computeCostView({ ...base, loaves: 1 });
    expect(view.breakdown.complete).toBe(true);
    expect(view.breakdown.batchCents).toBe(139);
    expect(view.breakdown.perLoafCents).toBe(139);
    expect(view.sellCents).toBe(417);
    expect(view.lines.map((l) => l.cost.costCents)).toEqual([108, 18, 0, 1, 12]);
    expect(view.lines.find((l) => l.source.name === 'Water')?.cost.status).toBe('free');
    expect(view.lines.find((l) => l.source.name === 'Salt')?.cost.belowOneCent).toBe(false);
  });

  it('matches the worked 2-loaf example: batch $2.77, $1.39 per loaf', () => {
    const view = computeCostView({ ...base, loaves: 2 });
    expect(view.lines.map((l) => l.cost.costCents)).toEqual([216, 35, 0, 2, 24]);
    expect(view.breakdown.batchCents).toBe(277);
    expect(view.breakdown.perLoafCents).toBe(139);
  });

  it('hides the suggested price and marks the cost partial when a line has no price', () => {
    const unpriced = base.pantryItems.map((p) =>
      p.name === 'Whole wheat flour'
        ? { ...p, packagePriceCents: null, packageSize: null, packageUnit: null }
        : p,
    );
    const view = computeCostView({ ...base, pantryItems: unpriced, loaves: 1 });
    expect(view.breakdown.complete).toBe(false);
    expect(view.sellCents).toBeNull();
    expect(view.breakdown.incompleteLineIds).toHaveLength(1);
  });
});
