import type { PantryItem, PriceHistoryEntry, Unit, PantryCategory } from '../types';
import type { FieldMap } from '../sql';

export interface PantryItemRow {
  id: string;
  name: string;
  category: PantryCategory;
  package_price_cents: number | null;
  package_size: number | null;
  package_unit: Unit | null;
  grams_per_cup: number | null;
  grams_per_each: number | null;
  store: string | null;
  priced_at: string | null;
  seed_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const PANTRY_FIELDS: FieldMap = {
  name: 'name',
  category: 'category',
  packagePriceCents: 'package_price_cents',
  packageSize: 'package_size',
  packageUnit: 'package_unit',
  gramsPerCup: 'grams_per_cup',
  gramsPerEach: 'grams_per_each',
  store: 'store',
  pricedAt: 'priced_at',
  seedKey: 'seed_key',
};

export function toPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    packagePriceCents: row.package_price_cents,
    packageSize: row.package_size,
    packageUnit: row.package_unit,
    gramsPerCup: row.grams_per_cup,
    gramsPerEach: row.grams_per_each,
    store: row.store,
    pricedAt: row.priced_at,
    seedKey: row.seed_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface PriceHistoryRow {
  id: string;
  pantry_item_id: string;
  package_price_cents: number;
  package_size: number;
  package_unit: Unit;
  store: string | null;
  priced_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const PRICE_HISTORY_FIELDS: FieldMap = {
  pantryItemId: 'pantry_item_id',
  packagePriceCents: 'package_price_cents',
  packageSize: 'package_size',
  packageUnit: 'package_unit',
  store: 'store',
  pricedAt: 'priced_at',
};

export function toPriceHistory(row: PriceHistoryRow): PriceHistoryEntry {
  return {
    id: row.id,
    pantryItemId: row.pantry_item_id,
    packagePriceCents: row.package_price_cents,
    packageSize: row.package_size,
    packageUnit: row.package_unit,
    store: row.store,
    pricedAt: row.priced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
