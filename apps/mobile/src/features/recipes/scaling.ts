/** View-only scaling for the recipe detail screen (screens-recipes.md section 10.1). */
import { roundHalfUp, scaleLines, type IngredientLine } from '@sourdough/core';

export interface ScaleState {
  by: 'loaves' | 'doughWeight';
  loaves: number;
  perLoafG: number;
}

export const MIN_PER_LOAF_G = 50;
export const MAX_PER_LOAF_G = 20_000;

const sumG = (lines: readonly IngredientLine[]) => lines.reduce((a, l) => a + l.amountG, 0);

export function initialScale(input: {
  yieldLoaves: number;
  doughWeightG: number | null;
  lines: readonly IngredientLine[];
  loaves?: number;
}): ScaleState {
  const total = sumG(input.lines);
  return {
    by: 'loaves',
    loaves: input.loaves ?? input.yieldLoaves,
    perLoafG: input.doughWeightG ?? Math.max(1, roundHalfUp(total / input.yieldLoaves)),
  };
}

export interface ScaledView {
  lines: IngredientLine[];
  totalG: number;
  /** Set in dough-weight mode: perLoafG x loaves. */
  targetG: number | null;
  factor: number;
  /** False when the stored amounts are shown untouched. */
  scaled: boolean;
}

/**
 * At the recipe's own scale the stored amounts are returned untouched, so decimals such as 2.5 g
 * survive. Anything else goes through core `scaleLines` (whole grams, half up).
 */
export function applyScale(
  lines: readonly IngredientLine[],
  yieldLoaves: number,
  state: ScaleState,
  initial: ScaleState,
): ScaledView {
  const base = sumG(lines);
  const atRecipe =
    state.loaves === yieldLoaves && (state.by === 'loaves' || state.perLoafG === initial.perLoafG);
  if (atRecipe || lines.length === 0 || base <= 0) {
    return { lines: [...lines], totalG: base, targetG: null, factor: 1, scaled: false };
  }
  const result =
    state.by === 'loaves'
      ? scaleLines(lines, { by: 'loaves', fromLoaves: yieldLoaves, toLoaves: state.loaves })
      : scaleLines(lines, { by: 'doughWeight', perLoafG: state.perLoafG, loaves: state.loaves });
  return {
    lines: result.lines,
    totalG: result.totalG,
    targetG: state.by === 'doughWeight' ? result.targetG : null,
    factor: result.factor,
    scaled: true,
  };
}

/** Whether the controls differ from the recipe (shows "Reset"). */
export function differsFromRecipe(state: ScaleState, initial: ScaleState, yieldLoaves: number) {
  return (
    state.loaves !== yieldLoaves || state.by !== 'loaves' || state.perLoafG !== initial.perLoafG
  );
}
