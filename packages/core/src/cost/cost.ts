import {
  err,
  ok,
  roundHalfUp,
  type BasisPoints,
  type Cents,
  type Grams,
  type Id,
  type Result,
} from '../types';
import { CoreInvariantError } from '../types';
import { splitLevain, type IngredientRole } from '../recipe/recipe';
import { toGrams, type ConversionError, type Unit } from '../units/units';

export interface PricedPackage {
  priceCents: Cents;
  size: number;
  unit: Unit;
  gramsPerCup?: number | null;
  gramsPerEach?: number | null;
}

/** Package size in grams (density for volume, gramsPerEach for count). A size <= 0 is invalidAmount. */
export function packageGrams(pkg: PricedPackage): Result<Grams, ConversionError> {
  if (!(pkg.size > 0)) return err({ code: 'invalidAmount', amount: pkg.size });
  return toGrams(pkg.size, pkg.unit, {
    gramsPerCup: pkg.gramsPerCup,
    gramsPerEach: pkg.gramsPerEach,
  });
}

/** Display only; never stored or used for line math. */
export function unitCostCentsPerGram(pkg: PricedPackage): Result<number, ConversionError> {
  const g = packageGrams(pkg);
  if (!g.ok) return g;
  if (!validPrice(pkg.priceCents)) return err({ code: 'invalidAmount', amount: pkg.priceCents });
  return ok(pkg.priceCents / g.value);
}

function validPrice(p: number): boolean {
  return Number.isFinite(p) && p >= 0;
}

/** Exact (unrounded) line cost in cents. Multiply before dividing (ADR 0006 section 2). */
function exactLineCost(billedGrams: Grams, pkg: PricedPackage): Result<number, ConversionError> {
  if (!Number.isFinite(billedGrams) || billedGrams < 0)
    return err({ code: 'invalidAmount', amount: billedGrams });
  if (!validPrice(pkg.priceCents)) return err({ code: 'invalidAmount', amount: pkg.priceCents });
  const g = packageGrams(pkg);
  if (!g.ok) return g;
  return ok((pkg.priceCents * billedGrams) / g.value);
}

/** roundHalfUp(priceCents * grams / packageGrams). */
export function lineCostCents(
  billedGrams: Grams,
  pkg: PricedPackage,
): Result<Cents, ConversionError> {
  const x = exactLineCost(billedGrams, pkg);
  if (!x.ok) return x;
  return ok(roundHalfUp(x.value));
}

export interface CostLineInput {
  lineId: Id;
  name: string;
  role: IngredientRole;
  amountG: Grams;
  levainHydrationPct?: number | null;
  pantry: PricedPackage | null;
}
export type CostLineStatus = 'priced' | 'free' | 'unpriced' | 'conversionError';
export interface CostLine {
  lineId: Id;
  name: string;
  billedG: Grams;
  costCents: Cents | null;
  belowOneCent: boolean;
  sharePct: number | null;
  status: CostLineStatus;
  conversionError?: ConversionError;
}
export interface CostBreakdown {
  lines: CostLine[];
  batchCents: Cents;
  loaves: number;
  perLoafCents: Cents;
  complete: boolean;
  incompleteLineIds: Id[];
}

/** Loaves must be > 0 (validate at the boundary); otherwise throws CoreInvariantError. */
export function costBreakdown(lines: readonly CostLineInput[], loaves: number): CostBreakdown {
  if (!Number.isFinite(loaves) || loaves <= 0) {
    throw new CoreInvariantError(`costBreakdown: loaves must be > 0, got ${loaves}`);
  }
  const built: CostLine[] = lines.map((l) => {
    // ADR 0007: a levain line is billed for its flour part only.
    const billedG =
      l.role === 'levain' ? splitLevain(l.amountG, l.levainHydrationPct ?? 100).flourG : l.amountG;
    const base = { lineId: l.lineId, name: l.name, billedG, sharePct: null as number | null };
    if (l.pantry === null) {
      return { ...base, costCents: null, belowOneCent: false, status: 'unpriced' as const };
    }
    const exact = exactLineCost(billedG, l.pantry);
    if (!exact.ok) {
      return {
        ...base,
        costCents: null,
        belowOneCent: false,
        status: 'conversionError' as const,
        conversionError: exact.error,
      };
    }
    const cents = roundHalfUp(exact.value);
    return {
      ...base,
      costCents: cents,
      belowOneCent: exact.value > 0 && cents === 0,
      status: l.pantry.priceCents === 0 ? ('free' as const) : ('priced' as const),
    };
  });

  const batchCents = built.reduce((s, l) => s + (l.costCents ?? 0), 0);
  for (const l of built) {
    if (l.costCents !== null && batchCents > 0) l.sharePct = (l.costCents / batchCents) * 100;
  }
  const incompleteLineIds = built
    .filter((l) => l.status === 'unpriced' || l.status === 'conversionError')
    .map((l) => l.lineId);
  return {
    lines: built,
    batchCents,
    loaves,
    perLoafCents: roundHalfUp(batchCents / loaves),
    complete: incompleteLineIds.length === 0,
    incompleteLineIds,
  };
}

export type SellRounding = { mode: 'none' } | { mode: 'up'; stepCents: number };

/**
 * Markup on cost from the UNROUNDED per-loaf cost (ADR 0006 section 6). Negative markup is clamped to 0.
 * Loaves <= 0 or a non-positive step throws CoreInvariantError.
 */
export function sellPriceCents(
  batchCents: Cents,
  loaves: number,
  markupBps: BasisPoints,
  rounding: SellRounding = { mode: 'none' },
): Cents {
  if (!Number.isFinite(loaves) || loaves <= 0) {
    throw new CoreInvariantError(`sellPriceCents: loaves must be > 0, got ${loaves}`);
  }
  const bps = Number.isFinite(markupBps) ? Math.max(0, markupBps) : 0;
  const base = roundHalfUp((batchCents * (10000 + bps)) / (10000 * loaves));
  if (rounding.mode === 'up') {
    if (!(rounding.stepCents > 0))
      throw new CoreInvariantError('sellPriceCents: stepCents must be > 0');
    return Math.ceil(base / rounding.stepCents) * rounding.stepCents;
  }
  return base;
}
