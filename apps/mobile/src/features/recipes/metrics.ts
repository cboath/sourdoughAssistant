/** Pure recipe math the screens share: lines, hydration, cost inputs, sell price, time span. */
import {
  costBreakdown,
  doughTotals,
  planSpanMin,
  sellPriceCents,
  type CostBreakdown,
  type CostLineInput,
  type IngredientLine,
  type PricedPackage,
  type StepTemplate,
} from '@sourdough/core';
import type { PantryItem, RecipeIngredient } from '../../db/types';
import { pricedPackage } from '../pantry/format';
import { formatRatioPercent } from './format';

export type LineSource = Pick<
  RecipeIngredient,
  'id' | 'name' | 'role' | 'amountG' | 'levainHydrationPct' | 'pantryItemId'
>;

export const toLines = (ingredients: readonly LineSource[]): IngredientLine[] =>
  ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    role: i.role,
    amountG: i.amountG,
    levainHydrationPct: i.levainHydrationPct,
  }));

export const indexPantry = (items: readonly PantryItem[]): Map<string, PantryItem> =>
  new Map(items.map((item) => [item.id, item]));

/** The priced package for a line (null when unlinked or the item has no price). Archived items still price. */
export function packageFor(
  ingredient: Pick<LineSource, 'pantryItemId'> | undefined,
  pantryById: ReadonlyMap<string, PantryItem>,
): PricedPackage | null {
  const item = ingredient?.pantryItemId ? pantryById.get(ingredient.pantryItemId) : undefined;
  return item ? pricedPackage(item) : null;
}

/** `lines` may be scaled; `ingredients` supplies the pantry link by line id. */
export function toCostInputs(
  lines: readonly IngredientLine[],
  ingredients: readonly LineSource[],
  pantryById: ReadonlyMap<string, PantryItem>,
): CostLineInput[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return lines.map((line) => ({
    lineId: line.id,
    name: line.name,
    role: line.role,
    amountG: line.amountG,
    levainHydrationPct: line.levainHydrationPct,
    pantry: packageFor(byId.get(line.id), pantryById),
  }));
}

export function costFor(
  lines: readonly IngredientLine[],
  ingredients: readonly LineSource[],
  pantryById: ReadonlyMap<string, PantryItem>,
  loaves: number,
): CostBreakdown {
  return costBreakdown(toCostInputs(lines, ingredients, pantryById), loaves);
}

/** The suggested sell price per loaf. Null (hidden) when the cost is incomplete or zero. */
export function sellFor(
  cost: CostBreakdown,
  markupBps: number,
  sellRoundingCents: number,
): number | null {
  if (!cost.complete || cost.batchCents <= 0) return null;
  return sellPriceCents(
    cost.batchCents,
    cost.loaves,
    markupBps,
    sellRoundingCents > 0 ? { mode: 'up', stepCents: sellRoundingCents } : { mode: 'none' },
  );
}

/** Hydration text from total water and flour, "–" without flour. */
export function hydrationText(lines: readonly IngredientLine[], locale: string): string {
  const totals = doughTotals(lines);
  return formatRatioPercent(totals.totalWaterG, totals.totalFlourG, locale);
}

/** Feed-to-ready span at default durations, or null while the steps are invalid or empty. */
export function spanMinutes(steps: readonly StepTemplate[], loaves: number): number | null {
  if (steps.length === 0) return null;
  const result = planSpanMin({
    items: [{ itemId: 'preview', label: 'preview', steps, loaves }],
    ovenCapacity: 1,
  });
  return result.ok ? result.value : null;
}
