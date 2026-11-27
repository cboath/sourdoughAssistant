import type { PantryItem, PriceHistoryEntry } from '../../../db/types';
import { typicalDensity, guessCategory } from '../densities';
import {
  convertedSizeText,
  itemStatus,
  perGramText,
  priceChange,
  readableUnitCost,
} from '../format';
import {
  SIZE_MAX_LENGTH,
  validatePantryEditor,
  validatePrice,
  type PriceFields,
} from '../validation';

const metric = { locale: 'en-US', currency: 'USD', unitSystem: 'metric' as const };
const us = { ...metric, unitSystem: 'us' as const };

const item = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'i',
  name: 'Bread flour',
  category: 'flour',
  packagePriceCents: 240,
  packageSize: 1,
  packageUnit: 'kg',
  gramsPerCup: 120,
  gramsPerEach: null,
  store: null,
  pricedAt: '2026-11-02',
  seedKey: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...over,
});

describe('item status and unit cost', () => {
  it('reads per 100 g (metric) and per lb (us)', () => {
    expect(readableUnitCost(item(), metric)).toBe('$0.24 per 100 g');
    expect(readableUnitCost(item(), us)).toBe('$1.09 per lb');
    expect(perGramText(item(), metric)).toBe('$0.0024 per g');
  });
  it('flags unpriced, free and missing conversions', () => {
    expect(
      itemStatus(item({ packagePriceCents: null, packageSize: null, packageUnit: null })),
    ).toBe('unpriced');
    expect(itemStatus(item({ packagePriceCents: 0 }))).toBe('free');
    expect(readableUnitCost(item({ packagePriceCents: 0 }), metric)).toBe('Free');
    expect(itemStatus(item({ packageUnit: 'cup', packageSize: 5, gramsPerCup: null }))).toBe(
      'needsDensity',
    );
    expect(itemStatus(item({ packageUnit: 'each', packageSize: 12, gramsPerEach: null }))).toBe(
      'needsEach',
    );
    expect(
      readableUnitCost(
        item({ packageUnit: 'each', packageSize: 12, packagePriceCents: 600, gramsPerEach: 30 }),
        metric,
      ),
    ).toBe('$0.50 each');
  });
  it('shows a converted size in the other system', () => {
    expect(convertedSizeText(5, 'lb', metric)).toBe('2.27 kg');
    expect(convertedSizeText(1, 'kg', us)).toBe('2.2 lb');
    expect(convertedSizeText(1, 'kg', metric)).toBeNull();
  });
});

describe('priceChange', () => {
  const entry = (
    cents: number,
    size: number,
    unit: PriceHistoryEntry['packageUnit'],
  ): PriceHistoryEntry => ({
    id: String(cents),
    pantryItemId: 'i',
    packagePriceCents: cents,
    packageSize: size,
    packageUnit: unit,
    store: null,
    pricedAt: '2026-01-01',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  });
  const f = { gramsPerCup: 120, gramsPerEach: null };
  it('compares per gram so package size changes are fair', () => {
    expect(priceChange(entry(260, 1, 'kg'), entry(240, 1, 'kg'), f)).toEqual({
      kind: 'up',
      pct: 8,
    });
    expect(priceChange(entry(240, 1, 'kg'), entry(480, 2, 'kg'), f)).toEqual({ kind: 'same' });
    expect(priceChange(entry(100, 1, 'kg'), entry(200, 1, 'kg'), f)).toEqual({
      kind: 'down',
      pct: 50,
    });
    expect(priceChange(entry(100, 1, 'kg'), entry(0, 1, 'kg'), f)).toEqual({ kind: 'wasFree' });
    expect(
      priceChange(entry(100, 1, 'cup'), entry(100, 1, 'kg'), {
        gramsPerCup: null,
        gramsPerEach: null,
      }),
    ).toEqual({ kind: 'unknown' });
  });
});

describe('defaults', () => {
  it('knows typical densities and guesses categories', () => {
    expect(typicalDensity('King Arthur Bread flour')).toBe(120);
    expect(typicalDensity('Mystery')).toBeNull();
    expect(guessCategory('Rye flour')).toBe('flour');
    expect(guessCategory('Olive oil')).toBe('fat');
    expect(guessCategory('Thing')).toBe('other');
  });
});

describe('validatePrice', () => {
  const rules = { currency: 'USD', locale: 'en-US', today: '2026-11-26', optional: false };
  const base: PriceFields = {
    price: '2.40',
    size: '1',
    unit: 'kg',
    gramsPerCup: '',
    gramsPerEach: '',
    store: ' Costco ',
    date: '2026-11-20',
  };
  it('accepts a good price and cleans the store', () => {
    const r = validatePrice(base, rules);
    expect(r.errors).toEqual({});
    expect(r.price).toEqual({
      priceCents: 240,
      size: 1,
      unit: 'kg',
      store: 'Costco',
      pricedAt: '2026-11-20',
    });
  });
  it('allows a free price (0) but not empty or negative', () => {
    expect(validatePrice({ ...base, price: '0' }, rules).price?.priceCents).toBe(0);
    expect(validatePrice({ ...base, price: '' }, rules).errors.price).toBe(
      "Enter a price, or 0 if it's free.",
    );
    expect(validatePrice({ ...base, price: '-1' }, rules).errors.price).toBeDefined();
    expect(validatePrice({ ...base, price: '2.499' }, rules).errors.price).toBe(
      'Use at most 2 decimal places.',
    );
    expect(validatePrice({ ...base, price: 'abc' }, rules).errors.price).toBe(
      'Enter a price like $2.40.',
    );
    expect(validatePrice({ ...base, price: '2000000' }, rules).errors.price).toMatch(/too high/);
  });
  it('checks size, date and the conversions the unit needs', () => {
    expect(validatePrice({ ...base, size: '0' }, rules).errors.size).toBe('Enter a size above 0.');
    expect(validatePrice({ ...base, size: '2000', unit: 'kg' }, rules).errors.size).toMatch(
      /too big/,
    );
    expect(validatePrice({ ...base, date: '2026-12-01' }, rules).errors.date).toBe(
      "The date can't be in the future.",
    );
    expect(validatePrice({ ...base, unit: 'cup' }, rules).errors.gramsPerCup).toMatch(
      /grams per cup/,
    );
    expect(
      validatePrice({ ...base, unit: 'cup' }, { ...rules, hasDensity: true }).errors.gramsPerCup,
    ).toBeUndefined();
    expect(
      validatePrice({ ...base, unit: 'cup', gramsPerCup: '5000' }, rules).errors.gramsPerCup,
    ).toBe('Enter between 1 and 1,000 g.');
    expect(validatePrice({ ...base, unit: 'each' }, rules).errors.gramsPerEach).toMatch(
      /one weighs/,
    );
  });
  it('SEC-M3-01: a size must be at least 0.01 after conversion, with at most 3 decimals', () => {
    expect(validatePrice({ ...base, size: '0.01', unit: 'g' }, rules).errors.size).toBeUndefined();
    expect(validatePrice({ ...base, size: '0.009', unit: 'g' }, rules).errors.size).toBe(
      'That package looks too small. Check the size and unit.',
    );
    // 0.001 kg is 1 g: fine. 1e-300 and 1e-9 are not.
    expect(
      validatePrice({ ...base, size: '0.001', unit: 'kg' }, rules).errors.size,
    ).toBeUndefined();
    expect(validatePrice({ ...base, size: '0.0000001', unit: 'g' }, rules).errors.size).toBe(
      'Use up to 3 decimal places.',
    );
    expect(validatePrice({ ...base, size: '1e-300', unit: 'g' }, rules).errors.size).toBe(
      'Enter a size above 0.',
    );
    expect(validatePrice({ ...base, size: '0.0001', unit: 'oz' }, rules).errors.size).toBe(
      'Use up to 3 decimal places.',
    );
    expect(validatePrice({ ...base, size: '0.001', unit: 'tsp' }, rules).errors.size).toMatch(
      /too small/,
    );
    expect(
      validatePrice({ ...base, size: '0.001', unit: 'oz' }, rules).errors.size,
    ).toBeUndefined();
    // Count: one each is the unit.
    expect(
      validatePrice({ ...base, size: '0.005', unit: 'each', gramsPerEach: '30' }, rules).errors
        .size,
    ).toBe('That package looks too small. Check the size and unit.');
  });

  it('SEC-M3-01: the largest allowed size passes and the next one up does not', () => {
    expect(validatePrice({ ...base, size: '1000', unit: 'kg' }, rules).errors.size).toBeUndefined();
    expect(validatePrice({ ...base, size: '1000.001', unit: 'kg' }, rules).errors.size).toMatch(
      /too big/,
    );
    expect(SIZE_MAX_LENGTH).toBe(12);
  });

  it('optional mode: both empty is fine, one without the other is not', () => {
    const opt = { ...rules, optional: true };
    expect(validatePrice({ ...base, price: '', size: '' }, opt).errors).toEqual({});
    expect(validatePrice({ ...base, size: '' }, opt).errors.size).toBe(
      'Enter the package size too.',
    );
    expect(validatePrice({ ...base, price: '' }, opt).errors.price).toBe(
      'Enter the price too, or clear the size.',
    );
  });
});

describe('validatePantryEditor', () => {
  const rules = {
    currency: 'USD',
    locale: 'en-US',
    today: '2026-11-26',
    optional: true,
    editing: false,
  };
  const fields = {
    name: ' Rye flour ',
    category: 'flour',
    price: '',
    size: '',
    unit: 'g' as const,
    gramsPerCup: '',
    gramsPerEach: '',
    store: '',
    date: '2026-11-26',
  };
  it('requires a name of at most 60 characters', () => {
    expect(validatePantryEditor({ ...fields, name: '  ' }, rules).errors.name).toBe(
      'Enter a name.',
    );
    expect(validatePantryEditor({ ...fields, name: 'x'.repeat(61) }, rules).errors.name).toMatch(
      /60/,
    );
    const ok = validatePantryEditor(fields, rules);
    expect(ok.errors).toEqual({});
    expect(ok.result.name).toBe('Rye flour');
  });
});
