/** Pure validation and conversion for the ingredient editor (screens-recipes.md section 8). */
import {
  ML_PER_US_CUP,
  WATER_GRAMS_PER_ML,
  toGrams,
  unitDimension,
  type ConversionFactors,
} from '@sourdough/core';
import type { IngredientRole, PantryCategory, PantryItem, Unit } from '../../db/types';
import { t, tp } from '../../lib/i18n';
import { parseNumberInput } from '../../lib/number';
import { LIMITS, cleanName } from '../../lib/sanitize';
import { parseOptionalGrams } from '../pantry/validation';

/** The units offered for a recipe line (R-2). */
export const LINE_UNITS: readonly Unit[] = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'cup',
  'tbsp',
  'tsp',
  'each',
];

export const ROLES: readonly IngredientRole[] = [
  'flour',
  'water',
  'salt',
  'levain',
  'inclusion',
  'other',
];

export interface IngredientFields {
  name: string;
  amount: string;
  unit: Unit;
  role: IngredientRole;
  levainHydration: string;
  gramsPerCup: string;
  gramsPerEach: string;
}

export type IngredientErrors = Partial<Record<keyof IngredientFields, string>>;

export interface ParsedIngredient {
  name: string;
  amountG: number;
  entryAmount: number;
  entryUnit: Unit;
  role: IngredientRole;
  levainHydrationPct: number | null;
  /** Densities typed inline, to be saved onto the pantry item. */
  gramsPerCup: number | null;
  gramsPerEach: number | null;
}

/** Role chosen by default for a pantry category (flows.md section 3; others map to Other). */
export function defaultRole(category: PantryCategory): IngredientRole {
  switch (category) {
    case 'flour':
      return 'flour';
    case 'water':
      return 'water';
    case 'salt':
      return 'salt';
    case 'starter':
      return 'levain';
    case 'inclusion':
      return 'inclusion';
    default:
      return 'other';
  }
}

/** Conversion factors for a line: the item's, plus inline entries, plus water's 1 g per ml. */
export function lineFactors(
  item: Pick<PantryItem, 'gramsPerCup' | 'gramsPerEach'> | null,
  role: IngredientRole,
  inlineDensity: number | null,
  inlineEach: number | null,
): ConversionFactors {
  const density =
    item?.gramsPerCup ??
    inlineDensity ??
    (role === 'water' ? WATER_GRAMS_PER_ML * ML_PER_US_CUP : null);
  return { gramsPerCup: density, gramsPerEach: item?.gramsPerEach ?? inlineEach };
}

const MAX_LINE_G = 50_000;

export function validateIngredient(
  values: IngredientFields,
  rules: { locale: string; item: Pick<PantryItem, 'gramsPerCup' | 'gramsPerEach'> | null },
): { errors: IngredientErrors; parsed: ParsedIngredient | null } {
  const errors: IngredientErrors = {};
  const { locale, item } = rules;

  const name = cleanName(values.name, 1000);
  if (name === '') errors.name = t('val.name.empty');
  else if (Array.from(name).length > LIMITS.lineName) {
    errors.name = t('val.name.long', { max: LIMITS.lineName });
  }

  const dimension = unitDimension(values.unit);
  const needsDensity =
    dimension === 'volume' && item?.gramsPerCup == null && values.role !== 'water';
  const needsEach = values.unit === 'each' && item?.gramsPerEach == null;
  const density = parseOptionalGrams(values.gramsPerCup, locale, 1, 1000, needsDensity, {
    required: t('val.density.required'),
    range: t('val.density.range'),
  });
  if (density.error) errors.gramsPerCup = density.error;
  const each = parseOptionalGrams(values.gramsPerEach, locale, 0.1, 10_000, needsEach, {
    required: t('val.each.required'),
    range: t('val.each.range'),
  });
  if (each.error) errors.gramsPerEach = each.error;

  let amountG: number | null = null;
  let amount: number | null = null;
  const n = parseNumberInput(values.amount, locale);
  if (!n.ok) errors.amount = t(n.reason === 'empty' ? 'val.amount.empty' : 'val.amount.nan');
  else if (n.value <= 0) errors.amount = t('val.amount.positive');
  else {
    const maxDecimals = values.unit === 'g' ? 1 : 2;
    if (n.decimals > maxDecimals) errors.amount = tp('val.amount.decimals', maxDecimals);
    else {
      amount = n.value;
      const grams = toGrams(
        n.value,
        values.unit,
        lineFactors(item, values.role, density.value, each.value),
      );
      if (grams.ok) {
        if (grams.value > MAX_LINE_G) errors.amount = t('val.amount.max');
        // Hundredths of a gram: drops float noise (240.00000000000003) but keeps 2.5 g exact.
        else amountG = Math.round(grams.value * 100) / 100;
      }
      // A conversion that needs a density is reported on the density field above.
    }
  }

  let hydration: number | null = null;
  if (values.role === 'levain') {
    const h = parseNumberInput(values.levainHydration, locale);
    if (!h.ok || h.value < 20 || h.value > 300) errors.levainHydration = t('val.levain.range');
    else hydration = h.value;
  }

  const ok = Object.keys(errors).length === 0 && amountG !== null && amount !== null;
  return {
    errors,
    parsed: ok
      ? {
          name,
          amountG: amountG as number,
          entryAmount: amount as number,
          entryUnit: values.unit,
          role: values.role,
          levainHydrationPct: hydration,
          gramsPerCup: density.value,
          gramsPerEach: each.value,
        }
      : null,
  };
}
