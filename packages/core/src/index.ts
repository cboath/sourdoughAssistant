// Public API of @sourdough/core: exactly what docs/core-api.md documents (section 6), nothing else.
// Internal helpers (prepareItems, layoutItem, layoutSlots, findOvenPhase, ...) stay unexported.
// `greeting` / `APP_NAME` are kept only for the app's existing home screen.

export { APP_NAME, greeting } from './greeting';

// 1. Shared primitives
export {
  CoreInvariantError,
  err,
  ok,
  percent,
  roundHalfUp,
  roundToStep,
  type BasisPoints,
  type Cents,
  type EpochMs,
  type Grams,
  type IanaZone,
  type Id,
  type IsoUtc,
  type Minutes,
  type Result,
} from './types';

// 2. Units
export {
  celsiusToFahrenheit,
  formatAmount,
  fahrenheitToCelsius,
  fromGrams,
  GRAMS_PER_UNIT,
  isUnit,
  ML_PER_UNIT,
  ML_PER_US_CUP,
  toGrams,
  unitDimension,
  WATER_GRAMS_PER_ML,
  type ConversionError,
  type ConversionFactors,
  type CountUnit,
  type DisplayAmount,
  type MassUnit,
  type Unit,
  type UnitDimension,
  type UnitSystem,
  type VolumeUnit,
} from './units';

// 3. Recipe math
export {
  bakersPercentages,
  doughTotals,
  hydrationPct,
  scaleLines,
  splitLevain,
  type BakersPercentages,
  type BakersPercentBasis,
  type BakersPercentRow,
  type DoughTotals,
  type IngredientLine,
  type IngredientRole,
  type ScaleOptions,
  type ScaleResult,
  type ScaleTarget,
} from './recipe';

// 4. Cost
export {
  costBreakdown,
  currencyMinorDigits,
  formatMoney,
  lineCostCents,
  packageGrams,
  parseMoneyInput,
  sellPriceCents,
  unitCostCentsPerGram,
  type CostBreakdown,
  type CostLine,
  type CostLineInput,
  type CostLineStatus,
  type MoneyParseError,
  type PricedPackage,
  type SellRounding,
} from './cost';

// 5. Scheduler
export {
  validateSteps,
  type AlongsideAlign,
  type StepAnchor,
  type StepKind,
  type StepTemplate,
  type StepValidationError,
} from './schedule/validate';
export {
  chooseDurations,
  type DurationChoice,
  type DurationOptions,
  type DurationSource,
} from './schedule/durations';
export {
  DEFAULT_TEMP_TABLE,
  REFERENCE_TEMP_C,
  temperatureMultiplier,
  type TempTableRow,
} from './schedule/temperature';
export {
  assignOvenSlots,
  earliestReadyAt,
  planBake,
  planSpanMin,
  type BakePlan,
  type OvenSlot,
  type PlanInput,
  type PlanItemInput,
  type PlannedFold,
  type PlannedStep,
  type PlanRequest,
  type PlanResult,
  type PlanWarning,
} from './schedule/backward';
export {
  dstWarnings,
  formatInZone,
  fromIso,
  localToUtc,
  toIso,
  utcToLocal,
  zoneTransitionsBetween,
  type LocalAdjustment,
  type LocalDateTime,
} from './schedule/time';
export { isInQuietHours, quietHoursWarnings, type QuietHours } from './schedule/quiet';
export {
  holdCapacity,
  recomputePlan,
  type RecomputeContext,
  type RecomputeEvent,
  type RecomputeResult,
  type StepProgress,
  type StepStatus,
} from './schedule/recompute';
