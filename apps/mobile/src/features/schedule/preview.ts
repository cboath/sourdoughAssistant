/**
 * The plan preview (screens-bake.md 3.1): a pure function over the draft, so the screen computes it
 * in a `useMemo` and tests call it directly. Core does the scheduling; this only assembles the
 * input, adds the zone-dependent warnings and the app-derived overlaps, and attributes errors to
 * recipes.
 */
import {
  chooseDurations,
  dstWarnings,
  localToUtc,
  planBake,
  quietHoursWarnings,
  validateSteps,
  type BakePlan,
  type DurationChoice,
  type EpochMs,
  type IanaZone,
  type Id,
  type LocalAdjustment,
  type LocalDateTime,
  type PlanInput,
  type PlanWarning,
  type QuietHours,
  type StepTemplate,
  type StepValidationError,
} from '@sourdough/core';
import { findOverlaps, type OverlapPair } from './overlap';

export interface PreviewItem {
  /** The future `bake_item` id. Core's step keys embed it, so it is the id that gets saved. */
  itemId: Id;
  name: string;
  steps: readonly StepTemplate[];
  loaves: number;
  /** Slider values by step id. Anything stale or out of range is ignored. */
  overrides: Readonly<Record<Id, number>>;
}

export interface PreviewInput {
  items: readonly PreviewItem[];
  mode: 'backward' | 'forward';
  readyLocal: LocalDateTime | null;
  ovenCapacity: number;
  reheatGapMin: number;
  kitchenTempC: number | null;
  quiet: QuietHours;
  zone: IanaZone;
  now: EpochMs;
}

export type PreviewStatus = 'ok' | 'tooSoon' | 'invalid' | 'noReadyTime';

export interface ItemError {
  itemIndex: number;
  error: StepValidationError;
}

export interface Preview {
  status: PreviewStatus;
  /** The plan to show: at the requested time when `ok`, at the earliest time when `tooSoon`. */
  plan: BakePlan | null;
  /** UTC instant of the picked ready time (backward mode). */
  requestedReadyAt: EpochMs | null;
  readyAdjustment: LocalAdjustment;
  earliestReadyAt: EpochMs | null;
  errors: ItemError[];
  /** Core, quiet-hours and DST warnings. */
  warnings: PlanWarning[];
  overlaps: OverlapPair[];
  /** Chosen durations per item (null when the item is invalid). */
  choices: Array<Record<Id, DurationChoice> | null>;
  /** The same without slider values (temperature or recipe default), for "Use default". */
  baseChoices: Array<Record<Id, DurationChoice> | null>;
  /** Too soon, but every slider at its minimum would fit the requested time (ADR 0010 section 6). */
  shortestFits: boolean;
  shortestOverrides: Array<Record<Id, number>>;
  spanMin: number | null;
}

/** A step the slider can change: sequential, not a fold step, with a real range. */
export const isRangeStep = (step: StepTemplate): boolean =>
  step.anchor.type === 'sequential' && !step.folds && step.minMin < step.maxMin;

/** Drops overrides for steps that changed or vanished, so an edited recipe never blocks a plan. */
export function sanitizeOverrides(
  steps: readonly StepTemplate[],
  overrides: Readonly<Record<Id, number>>,
): Record<Id, number> {
  const clean: Record<Id, number> = {};
  for (const step of steps) {
    const value = overrides[step.id];
    if (
      value !== undefined &&
      isRangeStep(step) &&
      Number.isFinite(value) &&
      value >= step.minMin &&
      value <= step.maxMin
    ) {
      clean[step.id] = Math.round(value);
    }
  }
  return clean;
}

const toPlanInput = (
  input: PreviewInput,
  overrides: ReadonlyArray<Readonly<Record<Id, number>>>,
): PlanInput => ({
  items: input.items.map((item, index) => ({
    itemId: item.itemId,
    label: item.name,
    steps: item.steps,
    loaves: item.loaves,
    durations: { kitchenTempC: input.kitchenTempC, overrides: overrides[index] ?? {} },
  })),
  ovenCapacity: input.ovenCapacity,
  reheatGapMin: input.reheatGapMin,
});

function attributeErrors(
  input: PreviewInput,
  fromPlanner: readonly StepValidationError[],
): ItemError[] {
  const own = input.items.flatMap((item, itemIndex) => {
    const result = validateSteps(item.steps);
    return result.ok ? [] : result.error.map((error) => ({ itemIndex, error }));
  });
  if (own.length > 0) return own;
  return fromPlanner.map((error) => {
    // `noOvenPhase` comes from the planner: blame the first recipe with no Bake step.
    const missing = input.items.findIndex((item) => !item.steps.some((s) => s.kind === 'bake'));
    return { itemIndex: error.code === 'noOvenPhase' && missing >= 0 ? missing : 0, error };
  });
}

const EMPTY_PREVIEW: Preview = {
  status: 'invalid',
  plan: null,
  requestedReadyAt: null,
  readyAdjustment: 'none',
  earliestReadyAt: null,
  errors: [],
  warnings: [],
  overlaps: [],
  choices: [],
  baseChoices: [],
  shortestFits: false,
  shortestOverrides: [],
  spanMin: null,
};

export function buildPreview(input: PreviewInput): Preview {
  if (input.items.length === 0) return EMPTY_PREVIEW;
  const items = input.items.map((item) => ({
    ...item,
    overrides: sanitizeOverrides(item.steps, item.overrides),
  }));
  const clean: PreviewInput = { ...input, items };

  const choicesFor = (withOverrides: boolean) =>
    items.map((item) => {
      const result = chooseDurations(item.steps, {
        kitchenTempC: input.kitchenTempC,
        overrides: withOverrides ? item.overrides : {},
      });
      return result.ok ? result.value : null;
    });
  const choices = choicesFor(true);
  const baseChoices = choicesFor(false);

  let requestedReadyAt: EpochMs | null = null;
  let readyAdjustment: LocalAdjustment = 'none';
  if (input.mode === 'backward') {
    if (!input.readyLocal) return { ...EMPTY_PREVIEW, status: 'noReadyTime', choices, baseChoices };
    const resolved = localToUtc(input.readyLocal, input.zone);
    requestedReadyAt = resolved.at;
    readyAdjustment = resolved.adjustment;
  }

  const planInput = toPlanInput(
    clean,
    items.map((i) => i.overrides),
  );
  const result = planBake(
    planInput,
    input.mode === 'backward' && requestedReadyAt !== null
      ? { mode: 'backward', readyAt: requestedReadyAt, now: input.now }
      : { mode: 'forward', startAt: input.now, now: input.now },
  );

  if (result.status === 'invalid') {
    return {
      ...EMPTY_PREVIEW,
      status: 'invalid',
      requestedReadyAt,
      readyAdjustment,
      errors: attributeErrors(input, result.errors),
      choices,
      baseChoices,
    };
  }

  const { plan } = result;
  const warnings = [
    ...plan.warnings,
    ...quietHoursWarnings(plan, input.quiet, input.zone),
    ...dstWarnings(plan, input.zone),
  ];

  let shortestFits = false;
  let shortestOverrides: Array<Record<Id, number>> = [];
  if (result.status === 'tooSoon' && requestedReadyAt !== null) {
    shortestOverrides = items.map((item) =>
      Object.fromEntries(item.steps.filter(isRangeStep).map((s) => [s.id, s.minMin])),
    );
    const attempt = planBake(toPlanInput(clean, shortestOverrides), {
      mode: 'backward',
      readyAt: requestedReadyAt,
      now: input.now,
    });
    shortestFits = attempt.status === 'ok';
  }

  return {
    status: result.status,
    plan,
    requestedReadyAt,
    readyAdjustment,
    earliestReadyAt: result.status === 'tooSoon' ? result.earliestReadyAt : null,
    errors: [],
    warnings,
    overlaps: findOverlaps(plan.steps),
    choices,
    baseChoices,
    shortestFits,
    shortestOverrides,
    spanMin: Math.round((plan.readyAt - plan.startAt) / 60_000),
  };
}
