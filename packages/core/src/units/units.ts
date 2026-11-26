import { err, ok, type Grams, type Result } from '../types';

export type MassUnit = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' | 'qt' | 'gal';
export type CountUnit = 'each';
export type Unit = MassUnit | VolumeUnit | CountUnit;
export type UnitDimension = 'mass' | 'volume' | 'count';

export const GRAMS_PER_UNIT: Readonly<Record<MassUnit, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** US customary cup (AMB-12). The metric cup (250 ml) is not supported in v1. */
export const ML_PER_US_CUP = 236.5882365;

export const ML_PER_UNIT: Readonly<Record<VolumeUnit, number>> = {
  ml: 1,
  l: 1000,
  cup: ML_PER_US_CUP,
  tbsp: ML_PER_US_CUP / 16,
  tsp: ML_PER_US_CUP / 48,
  floz: ML_PER_US_CUP / 8,
  qt: ML_PER_US_CUP * 4,
  gal: ML_PER_US_CUP * 16,
};

/** Used when role = 'water' and no density is set (AMB-12). */
export const WATER_GRAMS_PER_ML = 1;

export function unitDimension(unit: Unit): UnitDimension {
  if (unit === 'each') return 'count';
  return Object.prototype.hasOwnProperty.call(GRAMS_PER_UNIT, unit) ? 'mass' : 'volume';
}

export function isUnit(x: string): x is Unit {
  return (
    x === 'each' ||
    Object.prototype.hasOwnProperty.call(GRAMS_PER_UNIT, x) ||
    Object.prototype.hasOwnProperty.call(ML_PER_UNIT, x)
  );
}

export interface ConversionFactors {
  gramsPerCup?: number | null; // density for volume to mass
  gramsPerEach?: number | null; // weight of one item for count to mass
}

export type ConversionError =
  | { code: 'missingDensity'; unit: Unit }
  | { code: 'missingEachWeight'; unit: Unit }
  | { code: 'invalidAmount'; amount: number };

function validAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Grams per one unit of `unit`, or a conversion error. */
function gramsPerOne(unit: Unit, factors?: ConversionFactors): Result<number, ConversionError> {
  const dim = unitDimension(unit);
  if (dim === 'mass') return ok(GRAMS_PER_UNIT[unit as MassUnit]);
  if (dim === 'volume') {
    if (!positive(factors?.gramsPerCup)) return err({ code: 'missingDensity', unit });
    return ok((ML_PER_UNIT[unit as VolumeUnit] * factors.gramsPerCup) / ML_PER_US_CUP);
  }
  if (!positive(factors?.gramsPerEach)) return err({ code: 'missingEachWeight', unit });
  return ok(factors.gramsPerEach);
}

/** Any unit to grams. Volume uses gramsPerCup / ML_PER_US_CUP per ml. */
export function toGrams(
  amount: number,
  unit: Unit,
  factors?: ConversionFactors,
): Result<Grams, ConversionError> {
  if (!validAmount(amount)) return err({ code: 'invalidAmount', amount });
  const per = gramsPerOne(unit, factors);
  if (!per.ok) return per;
  return ok(amount * per.value);
}

/** Grams to any unit (inverse of toGrams). */
export function fromGrams(
  grams: Grams,
  unit: Unit,
  factors?: ConversionFactors,
): Result<number, ConversionError> {
  if (!validAmount(grams)) return err({ code: 'invalidAmount', amount: grams });
  const per = gramsPerOne(unit, factors);
  if (!per.ok) return per;
  return ok(grams / per.value);
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}
