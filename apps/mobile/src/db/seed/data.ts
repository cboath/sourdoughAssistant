/**
 * Seed catalog: the ONLY file to edit when Chris supplies his own recipes and prices (plan Q6).
 *
 * Everything here is a PLACEHOLDER:
 * - Pantry prices are illustrative (they reproduce the PRD section 6 acceptance example).
 * - The country loaf amounts are the PRD section 4 example (500 g flour, 375 g water, 10 g salt,
 *   100 g levain at 100%), with 50 g of the flour as whole wheat so the PRD cost example ($1.39
 *   per loaf, 77.3% hydration) reproduces.
 * - The whole wheat and inclusion loaves are generic starting points, not tested formulas.
 * - Step timings come from the PRD section 5 default template (Chris's own process).
 *
 * Rules for editing:
 * - `seedKey` values are permanent identities. Never rename one; add a new entry instead.
 * - Changing an existing entry does NOT update rows already on a device (the user may have edited
 *   them). To ship new seeds, add entries with `sinceVersion` = the new `SEED_VERSION`.
 */
import type { IngredientInput, NewPantryItem, NewRecipe, StepKind, StepTemplate } from '../types';

/** Bump when adding entries; each new entry sets `sinceVersion` to the new value. */
export const SEED_VERSION = 1;

/**
 * Every seeded row has a hard-coded UUID and one fixed timestamp, so each device that installs the
 * app gets byte-identical seed rows. Sync (v1.1) then sees the same rows everywhere instead of
 * duplicates, and the old timestamp means any real edit wins over an untouched seed
 * (docs/sync-readiness.md N1). Never change an id or the timestamp once released.
 */
export const SEED_EPOCH = '2026-01-01T00:00:00.000Z';
/** Local-date form of `SEED_EPOCH`, used for `priced_at`. */
export const SEED_DATE = '2026-01-01';

export interface PantrySeed {
  id: string;
  /** Id of the first price_history row; a priced item writes exactly one. */
  priceHistoryId: string;
  seedKey: string;
  sinceVersion: number;
  item: Omit<NewPantryItem, 'seedKey'>;
}

export interface SeedIngredient extends Omit<IngredientInput, 'pantryItemId'> {
  id: string;
  /** `seedKey` of a pantry seed (or an existing pantry item with that key). */
  pantryKey?: string;
}

/** `alongsideOf` names another step in the same list by `key`; the anchor uses that step's id. */
export interface SeedStep extends Omit<StepTemplate, 'anchor'> {
  key: string;
  alongsideOf?: string;
}

export interface RecipeSeed {
  id: string;
  seedKey: string;
  sinceVersion: number;
  recipe: Omit<NewRecipe, 'seedKey'>;
  ingredients: SeedIngredient[];
  steps: SeedStep[];
}

export interface SeedCatalog {
  pantry: PantrySeed[];
  recipes: RecipeSeed[];
}

// Pantry (placeholder prices, USD cents) ----------------------------------------------------

const PANTRY: PantrySeed[] = [
  {
    seedKey: 'pantry:bread-flour',
    id: '5eed0001-0000-4000-8000-000000000001',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000001',
    sinceVersion: 1,
    // $12.00 / 5000 g = $0.0024 per g
    item: {
      name: 'Bread flour',
      category: 'flour',
      packagePriceCents: 1200,
      packageSize: 5000,
      packageUnit: 'g',
      gramsPerCup: 120,
    },
  },
  {
    seedKey: 'pantry:whole-wheat-flour',
    id: '5eed0001-0000-4000-8000-000000000002',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000002',
    sinceVersion: 1,
    // $7.00 / 2000 g = $0.0035 per g
    item: {
      name: 'Whole wheat flour',
      category: 'flour',
      packagePriceCents: 700,
      packageSize: 2000,
      packageUnit: 'g',
      gramsPerCup: 113,
    },
  },
  {
    seedKey: 'pantry:salt',
    id: '5eed0001-0000-4000-8000-000000000003',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000003',
    sinceVersion: 1,
    // $1.00 / 1000 g = $0.001 per g
    item: {
      name: 'Salt',
      category: 'salt',
      packagePriceCents: 100,
      packageSize: 1000,
      packageUnit: 'g',
      gramsPerCup: 292,
    },
  },
  {
    seedKey: 'pantry:water',
    id: '5eed0001-0000-4000-8000-000000000004',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000004',
    sinceVersion: 1,
    // Water costs nothing by default (PRD C-5); the user can price it.
    item: {
      name: 'Water',
      category: 'water',
      packagePriceCents: 0,
      packageSize: 1000,
      packageUnit: 'ml',
      gramsPerCup: 236.59,
    },
  },
  {
    seedKey: 'pantry:cheddar',
    id: '5eed0001-0000-4000-8000-000000000005',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000005',
    sinceVersion: 1,
    item: {
      name: 'Sharp cheddar',
      category: 'inclusion',
      packagePriceCents: 799,
      packageSize: 454,
      packageUnit: 'g',
      gramsPerCup: 113,
    },
  },
  {
    seedKey: 'pantry:jalapeno',
    id: '5eed0001-0000-4000-8000-000000000006',
    priceHistoryId: '5eed0002-0000-4000-8000-000000000006',
    sinceVersion: 1,
    // $1.00 for 4 peppers, about 30 g each.
    item: {
      name: 'Jalapeño',
      category: 'inclusion',
      packagePriceCents: 100,
      packageSize: 4,
      packageUnit: 'each',
      gramsPerEach: 30,
    },
  },
];

// Process template (PRD section 5, docs/data-model.md section 5) ----------------------------

const base = {
  tempSensitive: false,
  folds: null,
  notify: true,
} as const;

type StepKey =
  | 'feed'
  | 'mix'
  | 'fold'
  | 'bulk'
  | 'shape'
  | 'cold'
  | 'preheat'
  | 'bakeCovered'
  | 'bakeUncovered'
  | 'cool';
type StepIds = Record<StepKey, string>;

// Step ids are global primary keys, so each recipe has its own set.
const STEP_IDS_1: StepIds = {
  feed: '5eed0005-0000-4000-8000-000000000101',
  mix: '5eed0005-0000-4000-8000-000000000102',
  fold: '5eed0005-0000-4000-8000-000000000103',
  bulk: '5eed0005-0000-4000-8000-000000000104',
  shape: '5eed0005-0000-4000-8000-000000000105',
  cold: '5eed0005-0000-4000-8000-000000000106',
  preheat: '5eed0005-0000-4000-8000-000000000107',
  bakeCovered: '5eed0005-0000-4000-8000-000000000108',
  bakeUncovered: '5eed0005-0000-4000-8000-000000000109',
  cool: '5eed0005-0000-4000-8000-000000000110',
};
const STEP_IDS_2: StepIds = {
  feed: '5eed0005-0000-4000-8000-000000000201',
  mix: '5eed0005-0000-4000-8000-000000000202',
  fold: '5eed0005-0000-4000-8000-000000000203',
  bulk: '5eed0005-0000-4000-8000-000000000204',
  shape: '5eed0005-0000-4000-8000-000000000205',
  cold: '5eed0005-0000-4000-8000-000000000206',
  preheat: '5eed0005-0000-4000-8000-000000000207',
  bakeCovered: '5eed0005-0000-4000-8000-000000000208',
  bakeUncovered: '5eed0005-0000-4000-8000-000000000209',
  cool: '5eed0005-0000-4000-8000-000000000210',
};
const STEP_IDS_3: StepIds = {
  feed: '5eed0005-0000-4000-8000-000000000301',
  mix: '5eed0005-0000-4000-8000-000000000302',
  fold: '5eed0005-0000-4000-8000-000000000303',
  bulk: '5eed0005-0000-4000-8000-000000000304',
  shape: '5eed0005-0000-4000-8000-000000000305',
  cold: '5eed0005-0000-4000-8000-000000000306',
  preheat: '5eed0005-0000-4000-8000-000000000307',
  bakeCovered: '5eed0005-0000-4000-8000-000000000308',
  bakeUncovered: '5eed0005-0000-4000-8000-000000000309',
  cool: '5eed0005-0000-4000-8000-000000000310',
};

const step = (
  ids: StepIds,
  key: StepKey,
  name: string,
  kind: StepKind,
  durationMin: number,
  minMin: number,
  maxMin: number,
  extra: Partial<SeedStep> = {},
): SeedStep => ({
  ...base,
  id: ids[key],
  key,
  name,
  kind,
  durationMin,
  minMin,
  maxMin,
  ...extra,
});

/** The default process (PRD section 5), shared by all three starter recipes. */
const processSteps = (ids: StepIds): SeedStep[] => [
  step(ids, 'feed', 'Final starter feeding', 'feed', 480, 360, 600),
  step(ids, 'mix', 'Mix and rest', 'mix', 60, 30, 120),
  step(ids, 'fold', 'Stretch and folds', 'fold', 120, 120, 120, {
    folds: { count: 4, intervalMin: 30 },
  }),
  step(ids, 'bulk', 'Bulk ferment', 'bulk', 360, 300, 480, { tempSensitive: true }),
  step(ids, 'shape', 'Shape', 'shape', 10, 5, 15),
  step(ids, 'cold', 'Cold ferment (fridge)', 'coldProof', 720, 720, 1440),
  step(ids, 'preheat', 'Preheat oven and Dutch oven', 'preheat', 30, 20, 45, {
    alongsideOf: 'bakeCovered',
  }),
  step(ids, 'bakeCovered', 'Bake, covered', 'bake', 30, 25, 35),
  step(ids, 'bakeUncovered', 'Bake, uncovered', 'bake', 15, 10, 25),
  step(ids, 'cool', 'Cool', 'cool', 60, 30, 120),
];

// Recipes -----------------------------------------------------------------------------------

const PLACEHOLDER_NOTE = 'Starter recipe with placeholder amounts. Edit it to match your own.';

const RECIPES: RecipeSeed[] = [
  {
    seedKey: 'recipe:country-loaf',
    id: '5eed0003-0000-4000-8000-000000000001',
    sinceVersion: 1,
    recipe: {
      name: 'Country loaf',
      notes: PLACEHOLDER_NOTE,
      yieldLoaves: 1,
      doughWeightG: 985,
      tags: ['Classic'],
    },
    ingredients: [
      {
        id: '5eed0004-0000-4000-8000-000000000101',
        name: 'Bread flour',
        role: 'flour',
        amountG: 450,
        pantryKey: 'pantry:bread-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000102',
        name: 'Whole wheat flour',
        role: 'flour',
        amountG: 50,
        pantryKey: 'pantry:whole-wheat-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000103',
        name: 'Water',
        role: 'water',
        amountG: 375,
        pantryKey: 'pantry:water',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000104',
        name: 'Salt',
        role: 'salt',
        amountG: 10,
        pantryKey: 'pantry:salt',
      },
      // Levain: 100 g at 100% hydration = 50 g flour (priced as bread flour) + 50 g water (ADR 0007).
      {
        id: '5eed0004-0000-4000-8000-000000000105',
        name: 'Levain',
        role: 'levain',
        amountG: 100,
        levainHydrationPct: 100,
        pantryKey: 'pantry:bread-flour',
      },
    ],
    steps: processSteps(STEP_IDS_1),
  },
  {
    seedKey: 'recipe:whole-wheat-loaf',
    id: '5eed0003-0000-4000-8000-000000000002',
    sinceVersion: 1,
    recipe: {
      name: 'Whole wheat loaf',
      notes: PLACEHOLDER_NOTE,
      yieldLoaves: 1,
      doughWeightG: 1010,
      tags: ['Whole wheat'],
    },
    ingredients: [
      {
        id: '5eed0004-0000-4000-8000-000000000201',
        name: 'Bread flour',
        role: 'flour',
        amountG: 300,
        pantryKey: 'pantry:bread-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000202',
        name: 'Whole wheat flour',
        role: 'flour',
        amountG: 200,
        pantryKey: 'pantry:whole-wheat-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000203',
        name: 'Water',
        role: 'water',
        amountG: 400,
        pantryKey: 'pantry:water',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000204',
        name: 'Salt',
        role: 'salt',
        amountG: 10,
        pantryKey: 'pantry:salt',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000205',
        name: 'Levain',
        role: 'levain',
        amountG: 100,
        levainHydrationPct: 100,
        pantryKey: 'pantry:bread-flour',
      },
    ],
    steps: processSteps(STEP_IDS_2),
  },
  {
    seedKey: 'recipe:cheddar-jalapeno-loaf',
    id: '5eed0003-0000-4000-8000-000000000003',
    sinceVersion: 1,
    recipe: {
      name: 'Cheddar jalapeño loaf',
      notes: PLACEHOLDER_NOTE,
      yieldLoaves: 1,
      doughWeightG: 1135,
      tags: ['Inclusion'],
    },
    ingredients: [
      {
        id: '5eed0004-0000-4000-8000-000000000301',
        name: 'Bread flour',
        role: 'flour',
        amountG: 500,
        pantryKey: 'pantry:bread-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000302',
        name: 'Water',
        role: 'water',
        amountG: 365,
        pantryKey: 'pantry:water',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000303',
        name: 'Salt',
        role: 'salt',
        amountG: 10,
        pantryKey: 'pantry:salt',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000304',
        name: 'Levain',
        role: 'levain',
        amountG: 100,
        levainHydrationPct: 100,
        pantryKey: 'pantry:bread-flour',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000305',
        name: 'Sharp cheddar',
        role: 'inclusion',
        amountG: 100,
        pantryKey: 'pantry:cheddar',
      },
      {
        id: '5eed0004-0000-4000-8000-000000000306',
        name: 'Jalapeño',
        role: 'inclusion',
        amountG: 60,
        entryAmount: 2,
        entryUnit: 'each',
        pantryKey: 'pantry:jalapeno',
      },
    ],
    steps: processSteps(STEP_IDS_3),
  },
];

export const SEED_CATALOG: SeedCatalog = { pantry: PANTRY, recipes: RECIPES };
