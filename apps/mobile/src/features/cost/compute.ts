/** The cost breakdown view model (screens-recipes.md section 11). Pure, so it is tested without UI. */
import {
  scaleLines,
  type CostBreakdown,
  type CostLine,
  type IngredientLine,
} from '@sourdough/core';
import type { PantryItem } from '../../db/types';
import { costFor, indexPantry, sellFor, toLines, type LineSource } from '../recipes/metrics';

export interface CostLineView {
  cost: CostLine;
  source: LineSource;
  item: PantryItem | null;
  /** The levain's total weight before it is split (the cost line bills only its flour). */
  amountG: number;
}

export interface CostView {
  loaves: number;
  breakdown: CostBreakdown;
  /** Hidden (null) when incomplete or when the batch costs nothing. */
  sellCents: number | null;
  lines: CostLineView[];
  /** Priced lines with a cost, largest first. */
  topLines: CostLineView[];
  /** Whether the displayed shares add up to exactly 100.0% (otherwise a footnote explains). */
  sharesSumTo100: boolean;
}

export function computeCostView(input: {
  ingredients: readonly LineSource[];
  pantryItems: readonly PantryItem[];
  yieldLoaves: number;
  loaves: number;
  markupBps: number;
  sellRoundingCents: number;
  /** Already-scaled lines (the detail screen scales by weight too); skips the by-loaves scaling. */
  scaledLines?: readonly IngredientLine[];
}): CostView {
  const pantryById = indexPantry(input.pantryItems);
  const base = toLines(input.ingredients);
  // At the recipe's own size the stored amounts are used unscaled.
  const lines: readonly IngredientLine[] =
    input.scaledLines ??
    (input.loaves === input.yieldLoaves || base.length === 0
      ? base
      : scaleLines(base, {
          by: 'loaves',
          fromLoaves: input.yieldLoaves,
          toLoaves: input.loaves,
        }).lines);
  const breakdown = costFor(lines, input.ingredients, pantryById, input.loaves);
  const sourceById = new Map(input.ingredients.map((i) => [i.id, i]));
  const amountById = new Map(lines.map((l) => [l.id, l.amountG]));
  const views: CostLineView[] = breakdown.lines.flatMap((cost) => {
    const source = sourceById.get(cost.lineId);
    if (!source) return [];
    return [
      {
        cost,
        source,
        item: source.pantryItemId ? (pantryById.get(source.pantryItemId) ?? null) : null,
        amountG: amountById.get(cost.lineId) ?? source.amountG,
      },
    ];
  });
  const topLines = views
    .filter((v) => v.cost.costCents !== null && v.cost.status !== 'unpriced')
    .sort((a, b) => (b.cost.costCents ?? 0) - (a.cost.costCents ?? 0));
  const shareSum = views.reduce(
    (sum, v) => sum + (v.cost.sharePct === null ? 0 : Math.round(v.cost.sharePct * 10) / 10),
    0,
  );
  return {
    loaves: input.loaves,
    breakdown,
    sellCents: sellFor(breakdown, input.markupBps, input.sellRoundingCents),
    lines: views,
    topLines,
    sharesSumTo100: breakdown.batchCents === 0 || Math.abs(shareSum - 100) < 0.05,
  };
}
