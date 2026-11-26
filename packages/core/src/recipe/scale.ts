import { CoreInvariantError, roundToStep, type Grams } from '../types';
import type { IngredientLine } from './recipe';

export type ScaleTarget =
  | { by: 'loaves'; fromLoaves: number; toLoaves: number }
  | { by: 'doughWeight'; perLoafG: Grams; loaves: number }
  | { by: 'factor'; factor: number };

export interface ScaleOptions {
  precisionG?: number; // default 1
  minNonZeroG?: number; // default 1
}

export interface ScaleResult {
  factor: number;
  lines: IngredientLine[];
  totalG: Grams;
  targetG: Grams | null;
}

function pos(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0)
    throw new CoreInvariantError(`scaleLines: ${what} must be > 0, got ${n}`);
  return n;
}

/**
 * ADR 0010 section 8 (AMB-13). Always scale from the saved base lines, never from a previous
 * rounded result. Invalid targets (zero, negative, NaN) throw CoreInvariantError: validate in the UI.
 */
export function scaleLines(
  lines: readonly IngredientLine[],
  target: ScaleTarget,
  opts: ScaleOptions = {},
): ScaleResult {
  const precisionG = opts.precisionG ?? 1;
  const minNonZeroG = opts.minNonZeroG ?? 1;
  let factor: number;
  let targetG: Grams | null = null;
  switch (target.by) {
    case 'loaves':
      factor = pos(target.toLoaves, 'toLoaves') / pos(target.fromLoaves, 'fromLoaves');
      break;
    case 'factor':
      factor = pos(target.factor, 'factor');
      break;
    case 'doughWeight': {
      targetG = pos(target.perLoafG, 'perLoafG') * pos(target.loaves, 'loaves');
      const base = lines.reduce((s, l) => s + l.amountG, 0);
      if (!(base > 0)) throw new CoreInvariantError('scaleLines: base dough weight is 0');
      factor = targetG / base;
      break;
    }
  }
  const out = lines.map((l) => {
    const scaled = l.amountG * factor;
    let amountG = roundToStep(scaled, precisionG);
    if (amountG <= 0 && scaled > 0) amountG = minNonZeroG;
    return { ...l, amountG };
  });
  return { factor, lines: out, totalG: out.reduce((s, l) => s + l.amountG, 0), targetG };
}
