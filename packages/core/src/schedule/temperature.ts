// Kitchen-temperature multiplier table (ADR 0008, provisional until Chris answers Q7).

export interface TempTableRow {
  tempC: number;
  multiplier: number;
}

export const REFERENCE_TEMP_C = 24;

/** 1.09^(24 - T), rounded to 2 dp, 18..30 C (ADR 0008). */
export const DEFAULT_TEMP_TABLE: readonly TempTableRow[] = [
  { tempC: 18, multiplier: 1.68 },
  { tempC: 19, multiplier: 1.54 },
  { tempC: 20, multiplier: 1.41 },
  { tempC: 21, multiplier: 1.3 },
  { tempC: 22, multiplier: 1.19 },
  { tempC: 23, multiplier: 1.09 },
  { tempC: 24, multiplier: 1.0 },
  { tempC: 25, multiplier: 0.92 },
  { tempC: 26, multiplier: 0.84 },
  { tempC: 27, multiplier: 0.77 },
  { tempC: 28, multiplier: 0.71 },
  { tempC: 29, multiplier: 0.65 },
  { tempC: 30, multiplier: 0.6 },
];

/** Linear interpolation; values beyond the table use the end rows. An empty table gives 1. */
export function temperatureMultiplier(
  tempC: number,
  table: readonly TempTableRow[] = DEFAULT_TEMP_TABLE,
): number {
  if (table.length === 0 || !Number.isFinite(tempC)) return 1;
  const rows = [...table].sort((a, b) => a.tempC - b.tempC);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (tempC <= first.tempC) return first.multiplier;
  if (tempC >= last.tempC) return last.multiplier;
  for (let i = 1; i < rows.length; i++) {
    const hi = rows[i]!;
    if (tempC <= hi.tempC) {
      const lo = rows[i - 1]!;
      const f = (tempC - lo.tempC) / (hi.tempC - lo.tempC);
      return lo.multiplier + f * (hi.multiplier - lo.multiplier);
    }
  }
  return last.multiplier;
}
