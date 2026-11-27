/**
 * Recipe and cost snapshots stored with a bake (ADR 0014, data-model section 3). The bake never
 * reads the live recipe again, so editing or deleting a recipe later can't change a bake.
 *
 * SEC-M3-01: `JSON.stringify` turns Infinity and NaN into `null`, which would silently corrupt a
 * stored cost. A breakdown with any non-finite or unsafe number is never persisted (the bake keeps
 * its recipe snapshot and gets no cost snapshot).
 */
import {
  scaleLines,
  type CostBreakdown,
  type IngredientLine,
  type StepTemplate,
} from '@sourdough/core';
import type { CostSnapshotV1, PantryItem, RecipeAggregate, RecipeSnapshotV1 } from '../../db/types';
import { costFor, indexPantry, sellFor, toLines } from '../recipes/metrics';

/** The recipe's lines at `loaves` (scaled by loaves only, architecture 7.1). */
export function linesForLoaves(aggregate: RecipeAggregate, loaves: number): IngredientLine[] {
  const base = toLines(aggregate.ingredients);
  const from = aggregate.recipe.yieldLoaves;
  if (loaves === from || base.length === 0) return base;
  return scaleLines(base, { by: 'loaves', fromLoaves: from, toLoaves: loaves }).lines;
}

export const toStepTemplates = (aggregate: RecipeAggregate): StepTemplate[] =>
  aggregate.steps.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    durationMin: s.durationMin,
    minMin: s.minMin,
    maxMin: s.maxMin,
    tempSensitive: s.tempSensitive,
    anchor: s.anchor,
    folds: s.folds,
    notify: s.notify,
  }));

export interface ItemCost {
  breakdown: CostBreakdown;
  /** Suggested price per loaf, or null when the cost is incomplete or zero. */
  sellCents: number | null;
  /** False when the breakdown has a number that can't be stored. */
  storable: boolean;
}

/** True when every number in the breakdown is finite and a safe integer where it must be. */
export function isStorableBreakdown(b: CostBreakdown): boolean {
  const cents = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (!cents(b.batchCents) || !cents(b.perLoafCents) || !Number.isFinite(b.loaves)) return false;
  return b.lines.every(
    (l) =>
      Number.isFinite(l.billedG) &&
      (l.costCents === null || cents(l.costCents)) &&
      (l.sharePct === null || Number.isFinite(l.sharePct)),
  );
}

export function computeItemCost(
  aggregate: RecipeAggregate,
  loaves: number,
  pantryItems: readonly PantryItem[],
  markupBps: number,
  sellRoundingCents: number,
): ItemCost {
  const lines = linesForLoaves(aggregate, loaves);
  const breakdown = costFor(lines, aggregate.ingredients, indexPantry(pantryItems), loaves);
  const storable = isStorableBreakdown(breakdown);
  return {
    breakdown,
    storable,
    sellCents: storable ? sellFor(breakdown, markupBps, sellRoundingCents) : null,
  };
}

/** True when at least one line has a price, so a cost line is worth showing. */
export const hasAnyPrice = (cost: ItemCost): boolean =>
  cost.storable && cost.breakdown.lines.some((l) => l.status === 'priced');

export function buildRecipeSnapshot(
  aggregate: RecipeAggregate,
  loaves: number,
  pantryItems: readonly PantryItem[],
): RecipeSnapshotV1 {
  const pantryById = indexPantry(pantryItems);
  const scaled = new Map(linesForLoaves(aggregate, loaves).map((l) => [l.id, l.amountG]));
  const { recipe } = aggregate;
  return {
    snapshotVersion: 1,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      yieldLoaves: recipe.yieldLoaves,
      doughWeightG: recipe.doughWeightG,
      notes: recipe.notes,
    },
    ingredients: aggregate.ingredients.map((ingredient) => {
      const item = ingredient.pantryItemId ? pantryById.get(ingredient.pantryItemId) : undefined;
      return {
        id: ingredient.id,
        name: ingredient.name,
        role: ingredient.role,
        amountG: scaled.get(ingredient.id) ?? ingredient.amountG,
        levainHydrationPct: ingredient.levainHydrationPct,
        pantry: item
          ? {
              id: item.id,
              name: item.name,
              packagePriceCents: item.packagePriceCents,
              packageSize: item.packageSize,
              packageUnit: item.packageUnit,
              gramsPerCup: item.gramsPerCup,
              gramsPerEach: item.gramsPerEach,
            }
          : null,
      };
    }),
    steps: toStepTemplates(aggregate),
  };
}

/** Null when the cost can't be stored safely (SEC-M3-01). */
export function buildCostSnapshot(
  cost: ItemCost,
  currencyCode: string,
  computedAt: string,
  markupBps: number,
): CostSnapshotV1 | null {
  if (!cost.storable) return null;
  return {
    snapshotVersion: 1,
    currencyCode,
    computedAt,
    breakdown: cost.breakdown,
    sellPriceCents: cost.sellCents,
    markupBps,
  };
}
