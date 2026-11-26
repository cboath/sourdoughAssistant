// Shared primitives for @sourdough/core (docs/core-api.md section 1).
// CO-01 created this file. Other tasks may only APPEND to it.

export type Id = string;
export type EpochMs = number; // UTC milliseconds
export type IsoUtc = string; // '2026-11-28T15:00:00.000Z'
export type IanaZone = string; // 'America/New_York'
export type Minutes = number; // integer
export type Grams = number; // may be fractional; display rounds
export type Cents = number; // integer minor units of the currency (ADR 0006)
export type BasisPoints = number; // 10000 = 100%

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Thrown only for programmer errors (violated invariants). Domain failures are returned as values. */
export class CoreInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreInvariantError';
  }
}

/** Half up (away from zero for non-negatives) with a 1e-9 epsilon against float noise. ADR 0006 section 3. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

/** roundHalfUp to a step, e.g. roundToStep(17.3, 0.5) = 17.5. */
export function roundToStep(x: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) {
    throw new CoreInvariantError(`roundToStep: step must be > 0, got ${step}`);
  }
  // toPrecision trims float noise such as 35 * 0.1 = 3.5000000000000004
  return Number((roundHalfUp(x / step) * step).toPrecision(12));
}

/** Percentage of num/den to `dp` decimals: roundHalfUp(num * 10^(dp+2) / den) / 10^dp. Null if den <= 0. */
export function percent(num: number, den: number, dp = 1): number | null {
  if (!(den > 0) || !Number.isFinite(den) || !Number.isFinite(num)) return null;
  return roundHalfUp((num * 10 ** (dp + 2)) / den) / 10 ** dp;
}
