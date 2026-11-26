/**
 * Domain types returned by the repositories (docs/data-model.md section 6): camelCase, booleans as
 * `boolean`, JSON columns parsed.
 *
 * The string unions below mirror the CHECK constraints in migration 0001 and the
 * `@sourdough/core` types in docs/core-api.md. They are declared here (not imported) because the
 * database layer must not depend on the core build state. They are structurally identical, so
 * values pass between the two without conversion.
 */

/** ISO 8601 UTC instant, `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export type IsoInstant = string;
/** Local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

export interface SyncFields {
  id: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  /** Tombstone (ADR 0004). `null` for live rows. */
  deletedAt: IsoInstant | null;
}

export type Unit =
  'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' | 'qt' | 'gal' | 'each';
export type IngredientRole = 'flour' | 'water' | 'salt' | 'levain' | 'inclusion' | 'other';
export type PantryCategory =
  | 'flour'
  | 'water'
  | 'salt'
  | 'starter'
  | 'sweetener'
  | 'fat'
  | 'dairy'
  | 'yeast'
  | 'inclusion'
  | 'other';
export type StepKind =
  | 'feed'
  | 'mix'
  | 'fold'
  | 'bulk'
  | 'shape'
  | 'proof'
  | 'coldProof'
  | 'preheat'
  | 'bake'
  | 'cool'
  | 'other';
export type AlongsideAlign = 'endsAtStart' | 'startsAtStart' | 'endsAtEnd';
export type StepAnchor =
  | { type: 'sequential' }
  | { type: 'alongside'; stepId: string; align: AlongsideAlign; offsetMin?: number };

/** Same shape as the core `StepTemplate` (docs/core-api.md 5.1). */
export interface StepTemplate {
  id: string;
  name: string;
  kind: StepKind;
  durationMin: number;
  minMin: number;
  maxMin: number;
  tempSensitive: boolean;
  anchor: StepAnchor;
  folds: { count: number; intervalMin: number } | null;
  notify: boolean;
}

// Settings ---------------------------------------------------------------------------------

export interface Settings extends SyncFields {
  id: 'settings';
  unitSystem: 'metric' | 'us';
  temperatureUnit: 'C' | 'F';
  quietHoursEnabled: boolean;
  quietStartMin: number;
  quietEndMin: number;
  ovenCapacity: number;
  reheatGapMin: number;
  markupBps: number;
  sellRoundingCents: number;
  headsUpMin: number;
  keepAwakeDefault: boolean;
  currencyOverride: string | null;
  onboardingCompletedAt: IsoInstant | null;
}
export type SettingsPatch = Partial<Omit<Settings, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

// Pantry -----------------------------------------------------------------------------------

export interface PantryItem extends SyncFields {
  name: string;
  category: PantryCategory;
  packagePriceCents: number | null;
  packageSize: number | null;
  packageUnit: Unit | null;
  gramsPerCup: number | null;
  gramsPerEach: number | null;
  store: string | null;
  pricedAt: LocalDate | null;
  seedKey: string | null;
}
export interface NewPantryItem {
  name: string;
  category?: PantryCategory;
  packagePriceCents?: number | null;
  packageSize?: number | null;
  packageUnit?: Unit | null;
  gramsPerCup?: number | null;
  gramsPerEach?: number | null;
  store?: string | null;
  /** Defaults to the UTC date of the clock when a price is set. */
  pricedAt?: LocalDate | null;
  seedKey?: string | null;
}
export type PantryItemPatch = Partial<NewPantryItem>;

export interface PriceHistoryEntry extends SyncFields {
  pantryItemId: string;
  packagePriceCents: number;
  packageSize: number;
  packageUnit: Unit;
  store: string | null;
  pricedAt: LocalDate;
}
export interface NewPriceHistoryEntry {
  pantryItemId: string;
  packagePriceCents: number;
  packageSize: number;
  packageUnit: Unit;
  store?: string | null;
  pricedAt: LocalDate;
}

// Recipes ----------------------------------------------------------------------------------

export interface Recipe extends SyncFields {
  name: string;
  notes: string;
  yieldLoaves: number;
  doughWeightG: number | null;
  tags: string[];
  favorite: boolean;
  seedKey: string | null;
}
export interface NewRecipe {
  name: string;
  notes?: string;
  yieldLoaves?: number;
  doughWeightG?: number | null;
  tags?: string[];
  favorite?: boolean;
  seedKey?: string | null;
}
export type RecipePatch = Partial<NewRecipe>;

export interface RecipeIngredient extends SyncFields {
  recipeId: string;
  pantryItemId: string | null;
  position: number;
  name: string;
  role: IngredientRole;
  amountG: number;
  entryAmount: number | null;
  entryUnit: Unit | null;
  levainHydrationPct: number | null;
}
/** `id` is optional; supply it when other rows reference this one, or to keep an existing row. */
export interface IngredientInput {
  id?: string;
  pantryItemId?: string | null;
  name: string;
  role: IngredientRole;
  amountG: number;
  entryAmount?: number | null;
  entryUnit?: Unit | null;
  levainHydrationPct?: number | null;
}

/** A recipe step row: the core `StepTemplate` plus storage fields. */
export interface RecipeStep extends StepTemplate {
  recipeId: string;
  position: number;
  notes: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  deletedAt: IsoInstant | null;
}
/** `id` is optional; supply it when an `alongside` anchor references this step. */
export interface StepInput extends Omit<StepTemplate, 'id'> {
  id?: string;
  notes?: string;
}

export interface RecipeAggregate {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}
export interface NewRecipeAggregate {
  recipe: NewRecipe;
  ingredients: IngredientInput[];
  steps: StepInput[];
}
export interface RecipeAggregatePatch {
  recipe?: RecipePatch;
  /** When given, replaces the whole list: rows matched by id are updated, others added or tombstoned. */
  ingredients?: IngredientInput[];
  steps?: StepInput[];
}

// Bakes ------------------------------------------------------------------------------------

export type BakeStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type BakeMode = 'backward' | 'forward';
export type BakeStepStatus = 'pending' | 'active' | 'done' | 'skipped';
export type DurationSource = 'default' | 'temperature' | 'user' | 'derived';

export interface OvenSlotJson {
  index: number;
  startAt: IsoInstant;
  endAt: IsoInstant;
  loaves: Array<{ bakeItemId: string; loaves: number }>;
}

export interface Bake extends SyncFields {
  status: BakeStatus;
  mode: BakeMode;
  requestedReadyAt: IsoInstant | null;
  originalReadyAt: IsoInstant;
  plannedReadyAt: IsoInstant;
  timeZone: string;
  kitchenTempC: number | null;
  ovenCapacity: number;
  reheatGapMin: number;
  headsUpMin: number;
  currencyCode: string;
  ovenSlots: OvenSlotJson[];
  notes: string;
  startedAt: IsoInstant | null;
  completedAt: IsoInstant | null;
  cancelledAt: IsoInstant | null;
}
export interface NewBake {
  status: BakeStatus;
  mode: BakeMode;
  requestedReadyAt?: IsoInstant | null;
  originalReadyAt: IsoInstant;
  plannedReadyAt: IsoInstant;
  timeZone: string;
  kitchenTempC?: number | null;
  ovenCapacity: number;
  reheatGapMin?: number;
  headsUpMin: number;
  currencyCode: string;
  ovenSlots?: OvenSlotJson[];
  notes?: string;
  startedAt?: IsoInstant | null;
  completedAt?: IsoInstant | null;
  cancelledAt?: IsoInstant | null;
}
/** `originalReadyAt` and `timeZone` are fixed at scheduling time and cannot be patched. */
export type BakePatch = Partial<Omit<NewBake, 'originalReadyAt' | 'timeZone' | 'currencyCode'>>;

/** docs/data-model.md section 3. */
export interface RecipeSnapshotV1 {
  snapshotVersion: 1;
  recipe: {
    id: string;
    name: string;
    yieldLoaves: number;
    doughWeightG: number | null;
    notes: string;
  };
  ingredients: Array<{
    id: string;
    name: string;
    role: IngredientRole;
    amountG: number;
    levainHydrationPct: number | null;
    pantry: null | {
      id: string;
      name: string;
      packagePriceCents: number | null;
      packageSize: number | null;
      packageUnit: Unit | null;
      gramsPerCup: number | null;
      gramsPerEach: number | null;
    };
  }>;
  steps: StepTemplate[];
}
export interface CostSnapshotV1 {
  snapshotVersion: 1;
  currencyCode: string;
  computedAt: IsoInstant;
  /** The core `CostBreakdown`. Opaque to the database layer. */
  breakdown: unknown;
  sellPriceCents: number | null;
  markupBps: number;
}

export interface BakeItem extends SyncFields {
  bakeId: string;
  recipeId: string | null;
  position: number;
  loaves: number;
  scaleFactor: number;
  recipeSnapshot: RecipeSnapshotV1;
  costSnapshot: CostSnapshotV1 | null;
}
export interface BakeItemInput {
  id?: string;
  recipeId?: string | null;
  loaves: number;
  scaleFactor: number;
  recipeSnapshot: RecipeSnapshotV1;
  costSnapshot?: CostSnapshotV1 | null;
}
export type BakeItemPatch = Partial<Omit<BakeItemInput, 'id' | 'recipeId'>>;

export interface BakeStep extends SyncFields {
  bakeId: string;
  bakeItemId: string | null;
  stepKey: string;
  sourceStepId: string | null;
  slotIndex: number | null;
  position: number;
  name: string;
  kind: StepKind;
  isAlongside: boolean;
  durationMin: number;
  durationSource: DurationSource;
  minMin: number;
  maxMin: number;
  originalPlannedStartAt: IsoInstant;
  plannedStartAt: IsoInstant;
  plannedEndAt: IsoInstant;
  actualStartAt: IsoInstant | null;
  actualEndAt: IsoInstant | null;
  status: BakeStepStatus;
  inferredDone: boolean;
  foldCount: number | null;
  foldIntervalMin: number | null;
  foldsDone: number;
  foldTimes: IsoInstant[];
  notify: boolean;
}
export interface BakeStepInput {
  id?: string;
  bakeItemId?: string | null;
  stepKey: string;
  sourceStepId?: string | null;
  slotIndex?: number | null;
  name: string;
  kind: StepKind;
  isAlongside?: boolean;
  durationMin: number;
  durationSource: DurationSource;
  minMin: number;
  maxMin: number;
  originalPlannedStartAt: IsoInstant;
  plannedStartAt: IsoInstant;
  plannedEndAt: IsoInstant;
  actualStartAt?: IsoInstant | null;
  actualEndAt?: IsoInstant | null;
  status?: BakeStepStatus;
  inferredDone?: boolean;
  foldCount?: number | null;
  foldIntervalMin?: number | null;
  foldsDone?: number;
  foldTimes?: IsoInstant[];
  notify?: boolean;
}
/** Identity (`stepKey`, `originalPlannedStartAt`, parent links) never changes after creation. */
export type BakeStepPatch = Partial<
  Omit<BakeStepInput, 'id' | 'bakeItemId' | 'stepKey' | 'sourceStepId' | 'originalPlannedStartAt'>
>;

export interface BakeAggregate {
  bake: Bake;
  items: BakeItem[];
  /** Ordered by `position`. */
  steps: BakeStep[];
}
export interface NewBakeAggregate {
  bake: NewBake;
  items: BakeItemInput[];
  steps: BakeStepInput[];
}

// Reads ------------------------------------------------------------------------------------

export interface ReadOptions {
  /** Include tombstoned rows. Default false. */
  includeDeleted?: boolean;
}
