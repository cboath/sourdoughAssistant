# `packages/core` public API (v1 contract)

2026-11-26 · mobile-solutions-architect (AR-01) · Consumers: CO-01, CO-02, CO-03 (implement), QA-02 (tests first), RN-05 to RN-09, DS-02/DS-03

This file is the contract. Implementers may add internal helpers, but **exported names, parameter shapes and semantics follow this file**. If anything needs to change, update this file first and tell QA-02. The rules are in ADR 0005 (time), 0006 (money), 0007 (levain), 0008 (temperature), 0009 (oven slots) and 0010 (scheduler semantics).

## 0. Ground rules

- Pure TypeScript, `strict: true`, ESM. **No React Native, Expo, DOM or Node-only imports.** Runtime dependencies: `date-fns` v4 and `date-fns-tz` v3 only.
- **No ambient time or zone.** Never call `Date.now()` or `new Date()` without an argument, and never read the device zone. Callers pass `now: EpochMs` and `zone: IanaZone`.
- **No id generation.** Callers pass ids in.
- **Errors:** domain and validation failures come back as values (`Result` or a `status` union). Throwing is only for programmer errors (violated invariants), with `CoreInvariantError`.
- **Units inside core:** grams, minutes, epoch ms, integer cents, and °C.
- Folder ownership:
  - `src/units`, `src/recipe`, `src/cost` belong to CO-01.
  - `src/schedule/{backward,durations,temperature,quiet,time,validate}.ts` belong to CO-02.
  - `src/schedule/{multi,recompute}.ts` and `src/index.ts` belong to CO-03.
  - `src/types.ts` (shared primitives) is created by CO-01. CO-02 may only add to it.
- **Where each export lives (CG-1, matching the implemented code).** Tests may import from these module paths. App code imports only from the barrel.

  | Module | Exports |
  |---|---|
  | `src/types.ts` | primitives, `Result`/`ok`/`err`, `CoreInvariantError`, `roundHalfUp`, `roundToStep`, `percent` |
  | `src/units/units.ts` | unit types and constants, `toGrams`, `fromGrams`, `unitDimension`, `isUnit`, °C/°F |
  | `src/units/format.ts` | `UnitSystem`, `DisplayAmount`, `formatAmount` |
  | `src/recipe/recipe.ts` | roles, `IngredientLine`, `splitLevain`, `doughTotals`, `hydrationPct`, `bakersPercentages` |
  | `src/recipe/scale.ts` | `ScaleTarget`, `ScaleOptions`, `ScaleResult`, `scaleLines` |
  | `src/cost/cost.ts` | `PricedPackage`, `packageGrams`, `unitCostCentsPerGram`, `lineCostCents`, `costBreakdown`, `sellPriceCents` |
  | `src/cost/money.ts` | `currencyMinorDigits`, `formatMoney`, `parseMoneyInput` |
  | `src/schedule/validate.ts` | step model types, `validateSteps` (+ internal helpers `foldDerivedMin`, `findOvenPhase`) |
  | `src/schedule/durations.ts` | `chooseDurations` and its types |
  | `src/schedule/temperature.ts` | `REFERENCE_TEMP_C`, `DEFAULT_TEMP_TABLE`, `temperatureMultiplier` |
  | `src/schedule/backward.ts` | plan types, **`planBake`, `planSpanMin`, `earliestReadyAt`, `assignOvenSlots`** (CO-02 put slots here too; CO-03 extends this or moves internals into `multi.ts` but **keeps re-exporting them from `backward.ts`**) |
  | `src/schedule/quiet.ts` | `QuietHours`, `isInQuietHours`, `quietHoursWarnings` |
  | `src/schedule/time.ts` | `localToUtc`, `utcToLocal`, `formatInZone`, `zoneTransitionsBetween`, `dstWarnings`, `toIso`, `fromIso` |
  | `src/schedule/multi.ts` | internal only (`layoutSlots`, `deriveSlots`, `holdStepOf`, `slotWarnings`, `DEFAULT_REHEAT_GAP_MIN`); not in the barrel |
  | `src/schedule/recompute.ts` | `recomputePlan`, `holdCapacity`, `RecomputeContext`, `RecomputeEvent`, `RecomputeResult`, `StepProgress`, `StepStatus` (CO-03). `RecomputeError` is exported from the module but not from the barrel |
  | `src/schedule/fixtures.ts` | `defaultTemplate()` test fixture. **Not** re-exported from the barrel |

- **Failure modes (CG-3, CG-4, matching CO-01).** Programmer or boundary errors **throw `CoreInvariantError`**. Callers validate at the UI or pantry boundary first:
  - `scaleLines`: a factor, loaves or perLoafG that is ≤ 0 or non-finite, or a base dough weight of 0.
  - `costBreakdown` and `sellPriceCents`: `loaves` ≤ 0. `sellPriceCents`: `rounding.stepCents` ≤ 0.
  - **Data problems are returned as values.** In `packageGrams`, `unitCostCentsPerGram` and `lineCostCents`, a package size ≤ 0, a negative or non-integer price, or negative or non-finite billed grams give `err({ code: 'invalidAmount', amount })`. `costBreakdown` turns that into `status: 'conversionError'` for the line.
  - **Lenient input:** `sellPriceCents` treats a negative or non-finite `markupBps` as 0.
  - The pantry editor also rejects size ≤ 0 and price < 0 at input (DB CHECKs back this up).

## 1. Shared primitives (`src/types.ts`)

```ts
export type Id = string;
export type EpochMs = number;          // UTC milliseconds
export type IsoUtc = string;           // '2026-11-28T15:00:00.000Z'
export type IanaZone = string;         // 'America/New_York'
export type Minutes = number;          // integer
export type Grams = number;            // may be fractional; display rounds
export type Cents = number;            // integer minor units of the currency (ADR 0006)
export type BasisPoints = number;      // 10000 = 100%

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok: <T>(value: T) => Result<T, never>;
export const err: <E>(error: E) => Result<never, E>;

export class CoreInvariantError extends Error {}

/** Half up (away from zero for non-negatives) with a 1e-9 epsilon against float noise. ADR 0006 §3. */
export function roundHalfUp(x: number): number;
/** roundHalfUp to a step, e.g. roundToStep(17.3, 0.5) = 17.5. */
export function roundToStep(x: number, step: number): number;
/** Percentage of num/den to `dp` decimals, computed as roundHalfUp(num * 10^(dp+2) / den) / 10^dp. Returns null if den <= 0. */
export function percent(num: number, den: number, dp?: number /* default 1 */): number | null;
```

## 2. Units (`src/units`), CO-01

```ts
export type MassUnit = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' | 'qt' | 'gal';
export type CountUnit = 'each';
export type Unit = MassUnit | VolumeUnit | CountUnit;
export type UnitDimension = 'mass' | 'volume' | 'count';

export const GRAMS_PER_UNIT: Readonly<Record<MassUnit, number>>;
//   { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 }
export const ML_PER_UNIT: Readonly<Record<VolumeUnit, number>>;
//   US customary (AMB-12): cup 236.5882365, tbsp = cup/16 (14.78676478125), tsp = cup/48 (4.92892159375),
//   floz = cup/8, qt = 4 cups, gal = 16 cups, ml 1, l 1000. The metric cup (250 ml) is not supported in v1.
export const ML_PER_US_CUP = 236.5882365;
export const WATER_GRAMS_PER_ML = 1;                // used when role = 'water' and no density is set (AMB-12)
// CG-10: core has no line-level consumer. The APP applies it when the user enters a volume for a water-role line whose
// pantry item has no gramsPerCup: toGrams(amount, unit, { gramsPerCup: WATER_GRAMS_PER_ML * ML_PER_US_CUP }).
// The result is stored as amount_g (canonical grams), so core math never sees volumes.

export function unitDimension(unit: Unit): UnitDimension;
export function isUnit(x: string): x is Unit;

export interface ConversionFactors {
  gramsPerCup?: number | null;   // density for volume to mass
  gramsPerEach?: number | null;  // weight of one item for count to mass
}
export type ConversionError =
  | { code: 'missingDensity'; unit: Unit }          // volume without gramsPerCup
  | { code: 'missingEachWeight'; unit: Unit }       // 'each' without gramsPerEach
  | { code: 'invalidAmount'; amount: number };      // negative, NaN or Infinity

/** Any unit to grams. Volume uses gramsPerCup / ML_PER_US_CUP per ml. */
export function toGrams(amount: number, unit: Unit, factors?: ConversionFactors): Result<Grams, ConversionError>;
/** Grams to any unit (inverse of toGrams). */
export function fromGrams(grams: Grams, unit: Unit, factors?: ConversionFactors): Result<number, ConversionError>;

export type UnitSystem = 'metric' | 'us';
export interface DisplayAmount { primary: string; secondary: string | null }
/**
 * Primary (CG-11): `${Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n)} g`
 * where n = roundHalfUp(grams) when grams >= 10, else roundHalfUp(grams*10)/10. Locale grouping applies:
 * en-US 1000 -> '1,000 g', 2.5 -> '2.5 g', 3 -> '3 g'; de-DE 2.5 -> '2,5 g' (DS-02 Q-A1; matches CO-01).
 * Secondary: cups (nearest 1/4, as '2 ¼ cups') when a density exists and unitSystem = 'us',
 * otherwise oz to 1 dp. Under 15 g, tsp/tbsp to the nearest 1/4 is used instead of cups. Number formatting uses `locale`.
 */
export function formatAmount(grams: Grams, opts: { unitSystem: UnitSystem; locale: string; factors?: ConversionFactors }): DisplayAmount;

export function celsiusToFahrenheit(c: number): number;
export function fahrenheitToCelsius(f: number): number;
```

## 3. Recipe math (`src/recipe`), CO-01

```ts
export type IngredientRole = 'flour' | 'water' | 'salt' | 'levain' | 'inclusion' | 'other';

export interface IngredientLine {
  id: Id;
  name: string;
  role: IngredientRole;
  amountG: Grams;
  levainHydrationPct?: number | null;  // required when role = 'levain' (default 100 at entry), else null
}

/** ADR 0007: flourG = amountG*100/(100+h), waterG = amountG - flourG. */
export function splitLevain(amountG: Grams, hydrationPct?: number /* default 100 */): { flourG: Grams; waterG: Grams };

export interface DoughTotals {
  addedFlourG: Grams; addedWaterG: Grams;
  levainFlourG: Grams; levainWaterG: Grams;
  totalFlourG: Grams;  // added + levain flour
  totalWaterG: Grams;  // added + levain water
  totalDoughG: Grams;  // sum of all lines
}
export function doughTotals(lines: readonly IngredientLine[]): DoughTotals;

/**
 * Unrounded hydration %, or null when totalFlourG = 0 (never NaN or Infinity). PRD example: 77.2727...
 * DISPLAY (CG-12): use percent(totals.totalWaterG, totals.totalFlourG), the exact ratio (309/400 -> 77.3).
 * Don't use percent(hydrationPct(...), 100), which rounds an already-floated value. No extra helper.
 */
export function hydrationPct(lines: readonly IngredientLine[]): number | null;

export type BakersPercentBasis = 'totalFlour' | 'addedFlour';
export interface BakersPercentRow { lineId: Id; pct: number | null }  // unrounded; display with percent(..., 1)
export interface BakersPercentages {
  basis: BakersPercentBasis;
  baseFlourG: Grams;
  rows: BakersPercentRow[];          // the levain row is the WHOLE levain weight (AMB-14)
  hydrationPct: number | null;       // always computed on total flour and water (incl. levain)
  totals: DoughTotals;
}
export function bakersPercentages(lines: readonly IngredientLine[], basis?: BakersPercentBasis /* 'totalFlour' */): BakersPercentages;

export type ScaleTarget =
  | { by: 'loaves'; fromLoaves: number; toLoaves: number }
  | { by: 'doughWeight'; perLoafG: Grams; loaves: number }   // target = perLoafG * loaves; base = sum of lines (AMB-13)
  | { by: 'factor'; factor: number };
export interface ScaleOptions {
  precisionG?: number;     // default 1 (whole grams)
  minNonZeroG?: number;    // default 1: a non-zero amount never rounds to 0 (AMB-13)
}
// Note (DS-02 Q-A1): scaling rounds every line to precisionG (whole grams) even below 10 g, so a scaled 2.5 g
// shows '3 g'. Unscaled saved amounts keep their REAL grams. A small-line precision option may be added later (additive).
export interface ScaleResult {
  factor: number;
  lines: IngredientLine[];   // same ids, amountG rounded; levainHydrationPct unchanged
  totalG: Grams;             // sum of the rounded lines (may differ from target by up to 0.5 g per line)
  targetG: Grams | null;
}
export function scaleLines(lines: readonly IngredientLine[], target: ScaleTarget, opts?: ScaleOptions): ScaleResult;
```

## 4. Cost (`src/cost`), CO-01

```ts
export interface PricedPackage {
  priceCents: Cents;
  size: number;
  unit: Unit;
  gramsPerCup?: number | null;
  gramsPerEach?: number | null;
}

/** Package size in grams (uses the density for volume and gramsPerEach for count). */
export function packageGrams(pkg: PricedPackage): Result<Grams, ConversionError>;
/** Display only; never stored or used for line math. */
export function unitCostCentsPerGram(pkg: PricedPackage): Result<number, ConversionError>;
/** roundHalfUp(priceCents * grams / packageGrams), multiplying before dividing. ADR 0006 §2. */
export function lineCostCents(billedGrams: Grams, pkg: PricedPackage): Result<Cents, ConversionError>;

export interface CostLineInput {
  lineId: Id;
  name: string;
  role: IngredientRole;
  amountG: Grams;
  levainHydrationPct?: number | null;
  pantry: PricedPackage | null;      // null = no pantry item, or the item has no price
}
export type CostLineStatus = 'priced' | 'free' | 'unpriced' | 'conversionError';
export interface CostLine {
  lineId: Id;
  name: string;
  billedG: Grams;                    // levain: its flour part only (ADR 0007); others: amountG
  costCents: Cents | null;           // null when unpriced or on conversion error
  belowOneCent: boolean;             // exact cost > 0 but rounds to 0 (UI shows "<1¢")
  sharePct: number | null;           // unrounded lineCents / batchCents * 100; null if batch = 0 or not priced
  status: CostLineStatus;            // 'free' = priced at 0 (water, C-5)
  conversionError?: ConversionError;
}
export interface CostBreakdown {
  lines: CostLine[];
  batchCents: Cents;                 // sum of the rounded priced lines
  loaves: number;
  perLoafCents: Cents;               // roundHalfUp(batchCents / loaves)
  complete: boolean;                 // false if any line is 'unpriced' or 'conversionError'
  incompleteLineIds: Id[];
}
export function costBreakdown(lines: readonly CostLineInput[], loaves: number): CostBreakdown;

export type SellRounding = { mode: 'none' } | { mode: 'up'; stepCents: number };
/**
 * Markup on cost (AMB-03), from the UNROUNDED per-loaf cost (AMB-02):
 *   base = roundHalfUp(batchCents * (10000 + markupBps) / (10000 * loaves)); then rounding 'up' to a multiple of stepCents.
 */
export function sellPriceCents(batchCents: Cents, loaves: number, markupBps: BasisPoints, rounding?: SellRounding): Cents;

/** ISO 4217 minor digits via Intl (USD 2, JPY 0, KWD 3). */
export function currencyMinorDigits(currency: string): number;
export function formatMoney(cents: Cents, currency: string, locale: string): string;
export type MoneyParseError = { code: 'empty' | 'notANumber' | 'negative' | 'tooManyDecimals'; maxDecimals?: number };
/** Locale-aware parse ('1,99' in de-DE). Rejects (never rounds) extra decimals (AMB-15). */
export function parseMoneyInput(text: string, currency: string, locale: string): Result<Cents, MoneyParseError>;
```

## 5. Scheduler (`src/schedule`), CO-02 and CO-03

### 5.1 Step model

```ts
export type StepKind = 'feed' | 'mix' | 'fold' | 'bulk' | 'shape' | 'proof' | 'coldProof' | 'preheat' | 'bake' | 'cool' | 'other';
export type AlongsideAlign = 'endsAtStart' | 'startsAtStart' | 'endsAtEnd';
export type StepAnchor =
  | { type: 'sequential' }
  | { type: 'alongside'; stepId: Id; align: AlongsideAlign; offsetMin?: Minutes };

export interface StepTemplate {
  id: Id;
  name: string;
  kind: StepKind;
  durationMin: Minutes;        // recipe default; for fold steps it's derived = count * interval
  minMin: Minutes;
  maxMin: Minutes;
  tempSensitive: boolean;
  anchor: StepAnchor;
  folds: { count: number; intervalMin: Minutes } | null;
  notify: boolean;
}
/** Steps are given in recipe order (position). */

export type StepValidationError =
  | { code: 'emptyRecipe' }
  | { code: 'rangeInvalid'; stepId: Id }                 // not 0 < min <= default <= max
  | { code: 'foldDurationMismatch'; stepId: Id }
  | { code: 'anchorMissing'; stepId: Id }
  | { code: 'alongsideChain'; stepId: Id }               // alongside anchored to an alongside step
  | { code: 'noSequentialSteps' }
  | { code: 'ovenPhaseNotContiguous'; stepIds: Id[] }
  | { code: 'noOvenPhase' }                              // only when more than one oven slot is needed
  | { code: 'overrideOutOfRange'; stepId: Id; minutes: Minutes };  // AMB-19
export function validateSteps(steps: readonly StepTemplate[]): Result<void, StepValidationError[]>;
```

**Fail closed on bad anchors (SEC-01 M4), with no signature change.**
- `validateSteps` resolves anchors **without recursion**. An alongside step may only anchor to a sequential step in the same list, so a cycle is impossible once `anchorMissing` (the target isn't in this list, for example another recipe's step) and `alongsideChain` are enforced.
- `planBake`, `planSpanMin`, `earliestReadyAt` and `chooseDurations` must call `validateSteps` (or the same checks) first. On failure they return `invalid` or `err` and never loop or throw.
- QA-02 adds a crafted case: a self-anchor, a two-step alongside cycle, and an anchor into a foreign id. Each must give `alongsideChain` or `anchorMissing` within the time limit.

### 5.2 Durations and temperature (ADR 0008)

```ts
export interface TempTableRow { tempC: number; multiplier: number }
export const REFERENCE_TEMP_C = 24;
export const DEFAULT_TEMP_TABLE: readonly TempTableRow[];   // 18..30 °C rows from ADR 0008
/**
 * Linear interpolation; values beyond the table use the end rows (so any finite temperature is clamped to 18..30 °C).
 * CG-8: core does NOT reject temperatures outside 10..40 °C and has no error code for it. Range validation is a
 * UI/input rule (schedule screen, plus the bake.kitchen_temp_c CHECK). ADR 0008 is updated to match.
 */
export function temperatureMultiplier(tempC: number, table?: readonly TempTableRow[]): number;

export type DurationSource = 'default' | 'temperature' | 'user' | 'derived';
export interface DurationChoice {
  stepId: Id;
  minutes: Minutes;
  source: DurationSource;            // 'derived' for fold steps
  clamped: boolean;
  unclampedMinutes: Minutes | null;  // set when the temperature result was clamped
}
export interface DurationOptions {
  kitchenTempC?: number | null;
  overrides?: Readonly<Record<Id, Minutes>>;   // slider values; must be within range (else overrideOutOfRange)
  tempTable?: readonly TempTableRow[];
}
export function chooseDurations(steps: readonly StepTemplate[], opts?: DurationOptions):
  Result<Record<Id, DurationChoice>, StepValidationError[]>;
```

### 5.3 Planning (single path for one or many recipes; ADR 0009, 0010)

```ts
export interface PlanItemInput {
  itemId: Id;                        // bake_item id (or a temp id while drafting)
  label: string;                     // recipe name, used in merged labels
  steps: readonly StepTemplate[];
  loaves: number;
  durations?: DurationOptions;       // per-item sliders; kitchenTempC is normally the same for all
}
export interface PlanInput {
  items: readonly PlanItemInput[];   // order = slot fill order
  ovenCapacity: number;              // loaves at once, >= 1
  reheatGapMin?: Minutes;            // default 0 (provisional, Q8)
}
export type PlanRequest =
  | { mode: 'backward'; readyAt: EpochMs; now: EpochMs }
  | { mode: 'forward'; startAt: EpochMs; now: EpochMs };   // "start now": startAt = now

// CG-2: oven slots are 1-BASED. Oven-phase and tail steps ALWAYS carry `:s<n>` in their key, even in a single-slot bake
// (e.g. `${itemId}:${stepId}:s1`); pre-oven steps never do. This matches CO-02. Notification ids depend on it.
export interface PlannedFold { index: number /* 1-based */; at: EpochMs }
export interface PlannedStep {
  key: string;                       // `${itemId}:${stepId}` | `${itemId}:${stepId}:s${slot}` | 'bake:preheat' | 'bake:reheat:s${slot}'
  itemId: Id | null;                 // null for bake-wide steps
  stepId: Id | null;
  slotIndex: number | null;
  name: string;                      // PLAIN step name; never includes slot or loaf info (UI composes labels)
  kind: StepKind;
  isAlongside: boolean;
  startAt: EpochMs;
  endAt: EpochMs;
  durationMin: Minutes;
  minMin: Minutes;
  maxMin: Minutes;
  durationSource: DurationSource;
  folds: PlannedFold[];              // [] unless a fold step
  notify: boolean;
  loaves: number | null;             // for per-slot oven and tail steps
  anchor?: { key: string; align: AlongsideAlign };  // alongside steps only: the PLANNED key they follow (added by CO-03,
                                                     // so recompute can move an alongside step with its anchor)
}
export interface OvenSlot { index: number; startAt: EpochMs; endAt: EpochMs; loaves: { itemId: Id; loaves: number }[] }

export type PlanWarning =
  | { code: 'quietHours'; stepKey: string; at: EpochMs; foldIndex?: number }
  | { code: 'temperatureClamped'; stepKey: string; minutes: Minutes; unclampedMinutes: Minutes }
  | { code: 'holdExceedsRange'; stepKey: string; effectiveMin: Minutes; maxMin: Minutes }
  | { code: 'durationOutOfRange'; stepKey: string; minutes: Minutes }      // after a live extend
  | { code: 'ovenConflict'; slotIndexes: [number, number] }
  | { code: 'dstTransition'; stepKey: string; offsetChangeMin: number };    // step spans a clock change (needs zone)

export interface BakePlan {
  mode: 'backward' | 'forward';
  startAt: EpochMs;                  // earliest step start (incl. alongside)
  readyAt: EpochMs;
  steps: PlannedStep[];              // sorted by startAt, then position
  slots: OvenSlot[];
  warnings: PlanWarning[];           // zone-independent ones only; see quietHoursWarnings / dstWarnings
}

export type PlanResult =
  | { status: 'ok'; plan: BakePlan }
  | { status: 'tooSoon'; requestedReadyAt: EpochMs; earliestReadyAt: EpochMs; plan: BakePlan }  // plan at earliestReadyAt (AMB-08)
  | { status: 'invalid'; errors: StepValidationError[] };

export function planBake(input: PlanInput, request: PlanRequest): PlanResult;

/** Total span (first start to ready) at the chosen durations. */
export function planSpanMin(input: PlanInput): Result<Minutes, StepValidationError[]>;
/** requested + (now - firstStart), rounded UP to the next 5 min (AMB-08). */
export function earliestReadyAt(input: PlanInput, now: EpochMs): Result<EpochMs, StepValidationError[]>;
/** Greedy slot fill in item order (ADR 0009 §2). */
export function assignOvenSlots(items: readonly { itemId: Id; loaves: number }[], ovenCapacity: number):
  { index: number; loaves: { itemId: Id; loaves: number }[] }[];
```

### 5.4 Time and zones (ADR 0005)

```ts
export type LocalDateTime = { date: string /* YYYY-MM-DD */; time: string /* HH:mm */ };
export type LocalAdjustment = 'none' | 'shiftedForward' | 'ambiguousEarlier';
/** Gap: moved forward by the gap length; repeated hour: first occurrence (AMB-04). */
export function localToUtc(local: LocalDateTime, zone: IanaZone): { at: EpochMs; adjustment: LocalAdjustment };
export function utcToLocal(at: EpochMs, zone: IanaZone): LocalDateTime & { offsetMin: number };
/** Pattern formatting via date-fns-tz formatInTimeZone. */
export function formatInZone(at: EpochMs, zone: IanaZone, pattern: string, locale?: unknown /* date-fns Locale */): string;
/** Offset changes strictly between from and to (for 'clocks change tonight'). */
export function zoneTransitionsBetween(from: EpochMs, to: EpochMs, zone: IanaZone): { at: EpochMs; offsetChangeMin: number }[];
export function dstWarnings(plan: BakePlan, zone: IanaZone): PlanWarning[];
export function toIso(at: EpochMs): IsoUtc;
export function fromIso(iso: IsoUtc): EpochMs;
```

### 5.5 Quiet hours (AMB-07)

```ts
export interface QuietHours { enabled: boolean; startMin: number; endMin: number }  // minutes after local midnight
/** [start, end) in `zone`; wraps when start > end; start === end means an empty window. */
export function isInQuietHours(at: EpochMs, quiet: QuietHours, zone: IanaZone): boolean;
/**
 * Checks step starts (incl. alongside) and fold reminders; not heads-ups.
 * CG-9: fold 1 shares its instant with the step start and is reported ONLY as the step-start warning
 * (no foldIndex). Folds 2..n add their own warnings with foldIndex. This matches CO-02.
 */
export function quietHoursWarnings(plan: BakePlan, quiet: QuietHours, zone: IanaZone): PlanWarning[];
```

### 5.6 Live recompute (AMB-11, ADR 0010 §7)

```ts
export type StepStatus = 'pending' | 'active' | 'done' | 'skipped';
export interface StepProgress {
  key: string;
  status: StepStatus;
  actualStartAt: EpochMs | null;
  actualEndAt: EpochMs | null;
  inferredDone: boolean;
  foldTimes: EpochMs[];              // actual fold times, index 0 = fold 1
}
export type RecomputeEvent =
  | { type: 'stepStarted'; key: string; at: EpochMs }
  | { type: 'stepDone'; key: string; at: EpochMs }
  | { type: 'foldDone'; key: string; foldIndex: number; at: EpochMs }
  | { type: 'extend'; key: string; minutes: Minutes };      // +/-; "Hold ready time" = extend on the hold step
export interface RecomputeResult {
  plan: BakePlan;                    // same keys; done steps unchanged; readyAt moved by the shift
  progress: StepProgress[];          // updated statuses (incl. inferred done)
  shiftedKeys: string[];             // steps whose planned times changed (for the DB write and notifications)
  deltaMin: Minutes;                 // signed change to this item's ready time
}
/**
 * CG-5/CG-6: optional 4th parameter. FINAL, as implemented by CO-03.
 *  - now: unstarted steps that an early finish would pull before `now` are held at `now` (LIV-16). Shifted alongside
 *    steps never start before `now` either. Without `now`, there's no clamp, and the caller is responsible.
 *  - quiet + zone: quiet-hours warnings are re-run for PENDING steps only (steps that haven't started).
 *
 * plan.warnings after a recompute:
 *  - temperatureClamped: kept from the input plan.
 *  - holdExceedsRange, ovenConflict, durationOutOfRange: recomputed. holdExceedsRange is emitted once per item, at the worst
 *    (longest) effective hold duration.
 *  - quietHours: dropped (stale after a shift). Re-added for pending steps only when quiet + zone are given.
 *  - dstTransition: dropped and NOT re-run. The caller calls dstWarnings(plan, zone) if it shows them.
 */
export interface RecomputeContext { now?: EpochMs; quiet?: QuietHours; zone?: IanaZone }
export function recomputePlan(plan: BakePlan, progress: readonly StepProgress[], event: RecomputeEvent, ctx?: RecomputeContext):
  Result<RecomputeResult, { code: 'unknownStep' | 'alreadyDone' | 'invalidFoldIndex' | 'notAFoldStep'; key: string }>;
/**
 * Hold-step helper for the "Hold ready time" button (CG-7). The hold step = the last sequential step before the item's oven phase.
 *  - canAbsorbEarlyMin = maxMin - currentDurationMin: how much the hold can be LENGTHENED to absorb an EARLY finish
 *    (keeping the ready time).
 *  - canAbsorbLateMin  = currentDurationMin - minMin: how much it can be SHORTENED to absorb a LATE finish.
 * Default template (cold ferment 720, range 720..1440): { canAbsorbEarlyMin: 720, canAbsorbLateMin: 0 }. Both are >= 0.
 * Returns null ONLY when the item has no hold step (no oven phase, or nothing sequential before it).
 * Decision: the signature stays progress-free. The CALLER (live view) hides or disables "Hold ready time" when
 * the hold step's progress is active, done or skipped, using the StepProgress it already has. Core doesn't need to know.
 */
export function holdCapacity(plan: BakePlan, itemId: Id): { holdKey: string; canAbsorbEarlyMin: Minutes; canAbsorbLateMin: Minutes } | null;
```

**Recompute rules CO-03 implemented** where ADR 0010 was silent. These are adopted as the contract:
- `stepDone` on a step that's already `done` or `skipped` returns `err({ code: 'alreadyDone' })`.
- `stepStarted`, `stepDone` and `foldDone` all **infer earlier sequential steps of the same item as done** (`inferredDone: true`, no actual times).
- An event on an **alongside or bake-wide step** (preheat, reheat) records progress for **that step only**. It never shifts the chain and never infers other steps.
- After a shift, alongside steps follow their `anchor`. The merged `bake:preheat` follows the **earliest slot-1 bake start**, and `bake:reheat:s{n}` follows its slot.
- `foldDone` keeps fold N at its **planned** time in the plan (the actual time goes in `progress.foldTimes`). Later folds re-anchor from the actual time, and the step end and everything after it shift (ADR 0010 section 7).
- **Multi-slot layout** (ADR 0009, confirmed in code):
  - The last slot is anchored to the ready time, and earlier slots run back to back.
  - `bake:reheat:s{n}` pseudo-steps are emitted only when `reheatGapMin > 0`.
  - **CHANGE REQUIRED (CO-03), decided after DS-03 Q-A5:** `PlannedStep.name` must be the **plain** step name from the template ("Bake, covered"), including on per-slot oven and tail steps. CO-03 currently emits `"Bake, covered (1 of 3 loaves: slot 2)"`; it should drop that suffix and keep `slotIndex` and `loaves` populated. Bake-wide steps keep fixed plain names ("Preheat oven", "Reheat"). The app composes display labels (ADR 0009 §6).
  - `noOvenPhase` is emitted during item preparation (internal `prepareItems`) and comes back from `planBake` as `status: 'invalid'`.

## 6. Barrel (`src/index.ts`, CO-03)

App code imports only from `@sourdough/core`. **The final public export list**, as landed by CO-03 in `src/index.ts`:

| Group | Values | Types |
|---|---|---|
| Scaffold (temporary) | `APP_NAME`, `greeting` | |
| Primitives | `CoreInvariantError`, `ok`, `err`, `percent`, `roundHalfUp`, `roundToStep` | `BasisPoints`, `Cents`, `EpochMs`, `Grams`, `IanaZone`, `Id`, `IsoUtc`, `Minutes`, `Result` |
| Units | `toGrams`, `fromGrams`, `unitDimension`, `isUnit`, `formatAmount`, `celsiusToFahrenheit`, `fahrenheitToCelsius`, `GRAMS_PER_UNIT`, `ML_PER_UNIT`, `ML_PER_US_CUP`, `WATER_GRAMS_PER_ML` | `ConversionError`, `ConversionFactors`, `CountUnit`, `DisplayAmount`, `MassUnit`, `Unit`, `UnitDimension`, `UnitSystem`, `VolumeUnit` |
| Recipe | `splitLevain`, `doughTotals`, `hydrationPct`, `bakersPercentages`, `scaleLines` | `BakersPercentages`, `BakersPercentBasis`, `BakersPercentRow`, `DoughTotals`, `IngredientLine`, `IngredientRole`, `ScaleOptions`, `ScaleResult`, `ScaleTarget` |
| Cost | `packageGrams`, `unitCostCentsPerGram`, `lineCostCents`, `costBreakdown`, `sellPriceCents`, `currencyMinorDigits`, `formatMoney`, `parseMoneyInput` | `CostBreakdown`, `CostLine`, `CostLineInput`, `CostLineStatus`, `MoneyParseError`, `PricedPackage`, `SellRounding` |
| Steps | `validateSteps` | `AlongsideAlign`, `StepAnchor`, `StepKind`, `StepTemplate`, `StepValidationError` |
| Durations | `chooseDurations`, `temperatureMultiplier`, `DEFAULT_TEMP_TABLE`, `REFERENCE_TEMP_C` | `DurationChoice`, `DurationOptions`, `DurationSource`, `TempTableRow` |
| Planning | `planBake`, `planSpanMin`, `earliestReadyAt`, `assignOvenSlots` | `BakePlan`, `OvenSlot`, `PlanInput`, `PlanItemInput`, `PlannedFold`, `PlannedStep`, `PlanRequest`, `PlanResult`, `PlanWarning` |
| Time | `localToUtc`, `utcToLocal`, `formatInZone`, `zoneTransitionsBetween`, `dstWarnings`, `toIso`, `fromIso` | `LocalAdjustment`, `LocalDateTime` |
| Quiet hours | `isInQuietHours`, `quietHoursWarnings` | `QuietHours` |
| Recompute | `recomputePlan`, `holdCapacity` | `RecomputeContext`, `RecomputeEvent`, `RecomputeResult`, `StepProgress`, `StepStatus` |

Not exported: internal helpers (`prepareItems`, `layoutItem`, `layoutSlots`, `findOvenPhase`, `foldDerivedMin`, `holdStepOf`, ...), `fixtures.ts`, and `RecomputeError` (its shape is the inline error union in section 5.6). `APP_NAME` and `greeting` go away once RN-04 replaces the scaffold home screen. Anything added to the barrel must be added here first.

## 7. Acceptance anchors (QA-02 cross-check)

| Case | Call | Expected |
|---|---|---|
| Hydration | `hydrationPct(R-HYD)` then `percent(...)` | 77.3 |
| Cost | `costBreakdown(PRD lines, 1).perLoafCents` | 139 |
| Schedule | `planBake(template, { backward, readyAt: Sat 2026-11-28 10:00 America/New_York })` | feed Fri 03:05, preheat Sat 07:45, all rows per PRD §5 |
| Cold 18 h | same, with `overrides[cold] = 1080` | feed Thu 21:05 |
| Quiet hours | `quietHoursWarnings(plan, {22:00 to 06:00})` | one warning at the feed (03:05); no step moved |
| DST | ADR 0005 table | spring Sat 02:05 EST, fall Sat 04:05 EDT |
| Slots | 3 loaves, capacity 2 | slot 1 = 2 loaves, slot 2 = 1; slot 2 ends cooling at readyAt |
| Live | `stepDone` 40 min late | every later step +40 min, readyAt +40 min |
