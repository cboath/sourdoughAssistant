/** Pure validators for the price sheet and the pantry editor (screens-recipes.md 3.4, 4.2). */
import {
  GRAMS_PER_UNIT,
  ML_PER_UNIT,
  currencyMinorDigits,
  formatMoney,
  parseMoneyInput,
  unitDimension,
  type Unit,
} from '@sourdough/core';
import { t, tp } from '../../lib/i18n';
import { parseNumberInput } from '../../lib/number';
import { parseLocalDate } from '../../lib/localDate';
import { LIMITS, cleanName } from '../../lib/sanitize';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export interface PriceFields {
  price: string;
  size: string;
  unit: Unit;
  gramsPerCup: string;
  gramsPerEach: string;
  store: string;
  date: string;
}

export interface PriceRules {
  currency: string;
  locale: string;
  /** Local date, the upper bound for "date priced". */
  today: string;
  /** Price and size may both be empty (new item). When one is given, both are required. */
  optional: boolean;
  /** The item already has a density / weight of one, so the field is not shown. */
  hasDensity?: boolean;
  hasEachWeight?: boolean;
}

export interface ParsedPrice {
  priceCents: number;
  size: number;
  unit: Unit;
  store: string | null;
  pricedAt: string;
}

export interface PriceValidation {
  errors: FieldErrors<keyof PriceFields & string>;
  /** Null when invalid, or when optional and left empty. */
  price: ParsedPrice | null;
  gramsPerCup: number | null;
  gramsPerEach: number | null;
}

const MAX_PRICE_MAJOR = 1_000_000;
const MAX_SIZE_COUNT = 10_000;
const MAX_SIZE_BASE = 1_000_000; // grams or millilitres (1,000 kg)
/** Smallest package after conversion (g, ml or one each) and most decimals typed (SEC-M3-01). */
const MIN_SIZE_BASE = 0.01;
const MAX_SIZE_DECIMALS = 3;
export const SIZE_MAX_LENGTH = 12;

/** The size in grams, millilitres or count, whichever its unit measures. */
function sizeInBase(size: number, unit: Unit): number {
  const dim = unitDimension(unit);
  if (dim === 'mass') return size * GRAMS_PER_UNIT[unit as keyof typeof GRAMS_PER_UNIT];
  if (dim === 'volume') return size * ML_PER_UNIT[unit as keyof typeof ML_PER_UNIT];
  return size;
}

function sizeTooBig(size: number, unit: Unit): boolean {
  const dim = unitDimension(unit);
  if (dim === 'mass')
    return size * GRAMS_PER_UNIT[unit as keyof typeof GRAMS_PER_UNIT] > MAX_SIZE_BASE;
  if (dim === 'volume') return size * ML_PER_UNIT[unit as keyof typeof ML_PER_UNIT] > MAX_SIZE_BASE;
  return size > MAX_SIZE_COUNT;
}

export function validatePrice(values: PriceFields, rules: PriceRules): PriceValidation {
  const errors: FieldErrors<keyof PriceFields & string> = {};
  const { currency, locale } = rules;
  const empty = values.price.trim() === '' && values.size.trim() === '';
  const skipPrice = rules.optional && empty;

  let priceCents: number | null = null;
  let size: number | null = null;

  if (!skipPrice) {
    if (rules.optional && values.price.trim() === '') errors.price = t('val.price.needed');
    else {
      const parsed = parseMoneyInput(values.price, currency, locale);
      if (!parsed.ok) {
        const code = parsed.error.code;
        if (code === 'empty') errors.price = t('val.price.empty');
        else if (code === 'negative') errors.price = t('val.price.negative');
        else if (code === 'tooManyDecimals') {
          const max = parsed.error.maxDecimals ?? 0;
          errors.price = max > 0 ? tp('val.price.decimals', max) : t('val.price.whole');
        } else errors.price = t('val.price.nan', { example: formatMoney(240, currency, locale) });
      } else if (parsed.value > MAX_PRICE_MAJOR * 10 ** currencyMinorDigits(currency)) {
        errors.price = t('val.price.max');
      } else priceCents = parsed.value;
    }

    if (rules.optional && values.size.trim() === '') errors.size = t('val.size.needed');
    else {
      const n = parseNumberInput(values.size, locale);
      if (!n.ok || n.value <= 0) errors.size = t('val.size.positive');
      else if (n.decimals > MAX_SIZE_DECIMALS) errors.size = t('val.size.decimals');
      else if (sizeInBase(n.value, values.unit) < MIN_SIZE_BASE) errors.size = t('val.size.min');
      else if (sizeTooBig(n.value, values.unit)) errors.size = t('val.size.max');
      else size = n.value;
    }
  }

  const needsDensity = !skipPrice && unitDimension(values.unit) === 'volume' && !rules.hasDensity;
  const needsEach = !skipPrice && values.unit === 'each' && !rules.hasEachWeight;
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

  if (!skipPrice) {
    const date = parseLocalDate(values.date);
    if (!date || values.date > rules.today) errors.date = t('val.date.future');
  }

  const ok = Object.keys(errors).length === 0;
  const store = cleanName(values.store, LIMITS.store);
  return {
    errors,
    price:
      ok && !skipPrice && priceCents !== null && size !== null
        ? {
            priceCents,
            size,
            unit: values.unit,
            store: store === '' ? null : store,
            pricedAt: values.date,
          }
        : null,
    gramsPerCup: density.value,
    gramsPerEach: each.value,
  };
}

/** A grams field: empty is fine unless `required`; otherwise it must be inside [min, max]. */
export function parseOptionalGrams(
  text: string,
  locale: string,
  min: number,
  max: number,
  required: boolean,
  messages: { required: string; range: string },
): { value: number | null; error?: string } {
  if (text.trim() === '')
    return required ? { value: null, error: messages.required } : { value: null };
  const n = parseNumberInput(text, locale);
  if (!n.ok || n.value < min || n.value > max) return { value: null, error: messages.range };
  return { value: n.value };
}

export interface PantryEditorFields extends PriceFields {
  name: string;
  category: string;
}

export interface PantryEditorValidation extends PriceValidation {
  name: string;
}

/** Name plus the (optional) first price. Edit mode skips the price rules (it is read-only there). */
export function validatePantryEditor(
  values: PantryEditorFields,
  rules: PriceRules & { editing: boolean },
): { errors: FieldErrors<keyof PantryEditorFields & string>; result: PantryEditorValidation } {
  const name = cleanName(values.name, LIMITS.nameImport);
  const priceRules: PriceRules = { ...rules, optional: true };
  const price = rules.editing
    ? validateConversionsOnly(values, rules)
    : validatePrice(values, priceRules);
  const errors: FieldErrors<keyof PantryEditorFields & string> = { ...price.errors };
  if (name === '') errors.name = t('val.name.empty');
  else if (Array.from(name).length > LIMITS.pantryName) {
    errors.name = t('val.name.long', { max: LIMITS.pantryName });
  }
  return { errors, result: { ...price, name } };
}

function validateConversionsOnly(values: PriceFields, rules: PriceRules): PriceValidation {
  const errors: FieldErrors<keyof PriceFields & string> = {};
  const density = parseOptionalGrams(values.gramsPerCup, rules.locale, 1, 1000, false, {
    required: t('val.density.required'),
    range: t('val.density.range'),
  });
  if (density.error) errors.gramsPerCup = density.error;
  const each = parseOptionalGrams(values.gramsPerEach, rules.locale, 0.1, 10_000, false, {
    required: t('val.each.required'),
    range: t('val.each.range'),
  });
  if (each.error) errors.gramsPerEach = each.error;
  return { errors, price: null, gramsPerCup: density.value, gramsPerEach: each.value };
}
