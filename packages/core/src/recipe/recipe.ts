import { CoreInvariantError, type Grams, type Id } from '../types';

export type IngredientRole = 'flour' | 'water' | 'salt' | 'levain' | 'inclusion' | 'other';

export interface IngredientLine {
  id: Id;
  name: string;
  role: IngredientRole;
  amountG: Grams;
  levainHydrationPct?: number | null; // required when role = 'levain' (default 100 at entry), else null
}

/** ADR 0007: flourG = amountG*100/(100+h), waterG = amountG - flourG. */
export function splitLevain(amountG: Grams, hydrationPct = 100): { flourG: Grams; waterG: Grams } {
  if (!Number.isFinite(hydrationPct) || hydrationPct < 0) {
    throw new CoreInvariantError(`splitLevain: invalid hydration ${hydrationPct}`);
  }
  const flourG = (amountG * 100) / (100 + hydrationPct);
  return { flourG, waterG: amountG - flourG };
}

export interface DoughTotals {
  addedFlourG: Grams;
  addedWaterG: Grams;
  levainFlourG: Grams;
  levainWaterG: Grams;
  totalFlourG: Grams;
  totalWaterG: Grams;
  totalDoughG: Grams;
}

export function doughTotals(lines: readonly IngredientLine[]): DoughTotals {
  let addedFlourG = 0;
  let addedWaterG = 0;
  let levainFlourG = 0;
  let levainWaterG = 0;
  let totalDoughG = 0;
  for (const line of lines) {
    totalDoughG += line.amountG;
    switch (line.role) {
      case 'flour':
        addedFlourG += line.amountG;
        break;
      case 'water':
        addedWaterG += line.amountG;
        break;
      case 'levain': {
        const s = splitLevain(line.amountG, line.levainHydrationPct ?? 100);
        levainFlourG += s.flourG;
        levainWaterG += s.waterG;
        break;
      }
      default:
        break; // salt, inclusion, other: not flour or water
    }
  }
  return {
    addedFlourG,
    addedWaterG,
    levainFlourG,
    levainWaterG,
    totalFlourG: addedFlourG + levainFlourG,
    totalWaterG: addedWaterG + levainWaterG,
    totalDoughG,
  };
}

/** Unrounded hydration %, or null when totalFlourG = 0. PRD example: 77.2727... */
export function hydrationPct(lines: readonly IngredientLine[]): number | null {
  const t = doughTotals(lines);
  if (!(t.totalFlourG > 0)) return null;
  return (t.totalWaterG / t.totalFlourG) * 100;
}

export type BakersPercentBasis = 'totalFlour' | 'addedFlour';
export interface BakersPercentRow {
  lineId: Id;
  pct: number | null;
}
export interface BakersPercentages {
  basis: BakersPercentBasis;
  baseFlourG: Grams;
  rows: BakersPercentRow[];
  hydrationPct: number | null;
  totals: DoughTotals;
}

export function bakersPercentages(
  lines: readonly IngredientLine[],
  basis: BakersPercentBasis = 'totalFlour',
): BakersPercentages {
  const totals = doughTotals(lines);
  const baseFlourG = basis === 'totalFlour' ? totals.totalFlourG : totals.addedFlourG;
  const rows = lines.map((l) => ({
    lineId: l.id,
    pct: baseFlourG > 0 ? (l.amountG / baseFlourG) * 100 : null,
  }));
  return {
    basis,
    baseFlourG,
    rows,
    hydrationPct: totals.totalFlourG > 0 ? (totals.totalWaterG / totals.totalFlourG) * 100 : null,
    totals,
  };
}
