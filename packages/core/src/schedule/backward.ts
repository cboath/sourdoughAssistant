// Scheduler: backward pass, forward "start now", earliest ready time (docs/core-api.md 5.3, ADR 0009, ADR 0010).
//
// All arithmetic is epoch ms plus/minus whole minutes (ADR 0005); no zone is ever consulted here.
//
// One or many oven slots (ADR 0009); the slot layout rules live in ./multi (provisional, AMB-10).

import {
  CoreInvariantError,
  err,
  ok,
  type EpochMs,
  type Id,
  type Minutes,
  type Result,
} from '../types';
import {
  chooseDurations,
  type DurationChoice,
  type DurationOptions,
  type DurationSource,
} from './durations';
import { DEFAULT_REHEAT_GAP_MIN, layoutSlots, slotWarnings, type ItemOvenTiming } from './multi';
import {
  findOvenPhase,
  type AlongsideAlign,
  validateSteps,
  type OvenPhase,
  type StepKind,
  type StepTemplate,
  type StepValidationError,
} from './validate';

const MIN_MS = 60_000;
const READY_ROUND_MS = 5 * MIN_MS;

export interface PlanItemInput {
  itemId: Id;
  label: string;
  steps: readonly StepTemplate[];
  loaves: number;
  durations?: DurationOptions;
}
export interface PlanInput {
  items: readonly PlanItemInput[];
  ovenCapacity: number;
  reheatGapMin?: Minutes;
}
export type PlanRequest =
  | { mode: 'backward'; readyAt: EpochMs; now: EpochMs }
  | { mode: 'forward'; startAt: EpochMs; now: EpochMs };

export interface PlannedFold {
  index: number; // 1-based
  at: EpochMs;
}
export interface PlannedStep {
  key: string;
  itemId: Id | null;
  stepId: Id | null;
  slotIndex: number | null;
  name: string;
  kind: StepKind;
  isAlongside: boolean;
  startAt: EpochMs;
  endAt: EpochMs;
  durationMin: Minutes;
  minMin: Minutes;
  maxMin: Minutes;
  durationSource: DurationSource;
  folds: PlannedFold[];
  notify: boolean;
  loaves: number | null;
  /**
   * Additive (CO-03): for alongside steps, the key of the step they are anchored to and how.
   * Live recompute uses it to move the step with its anchor. Absent on sequential steps.
   */
  anchor?: { key: string; align: AlongsideAlign };
}
export interface OvenSlot {
  index: number; // 1-based
  startAt: EpochMs;
  endAt: EpochMs;
  loaves: { itemId: Id; loaves: number }[];
}

export type PlanWarning =
  | { code: 'quietHours'; stepKey: string; at: EpochMs; foldIndex?: number }
  | { code: 'temperatureClamped'; stepKey: string; minutes: Minutes; unclampedMinutes: Minutes }
  | { code: 'holdExceedsRange'; stepKey: string; effectiveMin: Minutes; maxMin: Minutes }
  | { code: 'durationOutOfRange'; stepKey: string; minutes: Minutes }
  | { code: 'ovenConflict'; slotIndexes: [number, number] }
  | { code: 'dstTransition'; stepKey: string; offsetChangeMin: number };

export interface BakePlan {
  mode: 'backward' | 'forward';
  startAt: EpochMs;
  readyAt: EpochMs;
  steps: PlannedStep[];
  slots: OvenSlot[];
  warnings: PlanWarning[];
}

export type PlanResult =
  | { status: 'ok'; plan: BakePlan }
  | { status: 'tooSoon'; requestedReadyAt: EpochMs; earliestReadyAt: EpochMs; plan: BakePlan }
  | { status: 'invalid'; errors: StepValidationError[] };

// ---------------------------------------------------------------------------------------------
// Preparation

export interface PreparedItem {
  index: number;
  input: PlanItemInput;
  choices: Record<Id, DurationChoice>;
  /** Sequential step indexes in recipe order. */
  seqIdx: number[];
  /** null when the recipe has no sequential `bake` step. */
  phase: OvenPhase | null;
  ovenMin: Minutes;
  tailMin: Minutes;
}

function minutesOf(p: { choices: Record<Id, DurationChoice> }, step: StepTemplate): Minutes {
  return p.choices[step.id]!.minutes;
}

/** Validates the input and resolves chosen durations for every item. */
export function prepareItems(input: PlanInput): Result<PreparedItem[], StepValidationError[]> {
  if (!Number.isInteger(input.ovenCapacity) || input.ovenCapacity < 1) {
    throw new CoreInvariantError(`ovenCapacity must be an integer >= 1, got ${input.ovenCapacity}`);
  }
  if (
    input.reheatGapMin !== undefined &&
    (!Number.isInteger(input.reheatGapMin) || input.reheatGapMin < 0)
  ) {
    throw new CoreInvariantError(`reheatGapMin must be an integer >= 0, got ${input.reheatGapMin}`);
  }
  if (input.items.length === 0) return err([{ code: 'emptyRecipe' }]);

  const errors: StepValidationError[] = [];
  const prepared: PreparedItem[] = [];
  input.items.forEach((item, index) => {
    if (!Number.isInteger(item.loaves) || item.loaves < 1) {
      throw new CoreInvariantError(
        `loaves must be an integer >= 1 for item ${item.itemId}, got ${item.loaves}`,
      );
    }
    const valid = validateSteps(item.steps);
    if (!valid.ok) {
      errors.push(...valid.error);
      return;
    }
    const chosen = chooseDurations(item.steps, item.durations);
    if (!chosen.ok) {
      errors.push(...chosen.error);
      return;
    }
    const seqIdx: number[] = [];
    item.steps.forEach((s, i) => {
      if (s.anchor.type === 'sequential') seqIdx.push(i);
    });
    const phase = findOvenPhase(item.steps);
    const p: PreparedItem = {
      index,
      input: item,
      choices: chosen.value,
      seqIdx,
      phase,
      ovenMin: 0,
      tailMin: 0,
    };
    if (phase) {
      p.ovenMin = phase.indexes.reduce((a, i) => a + minutesOf(p, item.steps[i]!), 0);
      p.tailMin = phase.tailIndexes.reduce((a, i) => a + minutesOf(p, item.steps[i]!), 0);
    }
    prepared.push(p);
  });
  if (errors.length > 0) return err(errors);
  // ADR 0009 section 1: a recipe without an oven phase can't be part of a multi-slot bake.
  if (prepared.some((p) => p.phase === null)) {
    const ovenLoaves = prepared
      .filter((p) => p.phase !== null)
      .map((p) => ({ itemId: p.input.itemId, loaves: p.input.loaves }));
    if (assignOvenSlots(ovenLoaves, input.ovenCapacity).length > 1)
      return err([{ code: 'noOvenPhase' }]);
  }
  return ok(prepared);
}

/** Greedy slot fill, loaf by loaf, in item order (ADR 0009 section 2). Slot indexes are 1-based. */
export function assignOvenSlots(
  items: readonly { itemId: Id; loaves: number }[],
  ovenCapacity: number,
): { index: number; loaves: { itemId: Id; loaves: number }[] }[] {
  if (!Number.isInteger(ovenCapacity) || ovenCapacity < 1) {
    throw new CoreInvariantError(`ovenCapacity must be an integer >= 1, got ${ovenCapacity}`);
  }
  const slots: { index: number; loaves: { itemId: Id; loaves: number }[] }[] = [];
  let current: { index: number; loaves: { itemId: Id; loaves: number }[] } | null = null;
  let used = 0;
  for (const item of items) {
    if (!Number.isInteger(item.loaves) || item.loaves < 1) {
      throw new CoreInvariantError(
        `loaves must be an integer >= 1 for item ${item.itemId}, got ${item.loaves}`,
      );
    }
    for (let n = 0; n < item.loaves; n++) {
      if (current === null || used === ovenCapacity) {
        current = { index: slots.length + 1, loaves: [] };
        slots.push(current);
        used = 0;
      }
      const last = current.loaves[current.loaves.length - 1];
      if (last && last.itemId === item.itemId) last.loaves += 1;
      else current.loaves.push({ itemId: item.itemId, loaves: 1 });
      used += 1;
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------------------------
// Layout of one item

export type StepPhaseName = 'pre' | 'oven' | 'tail';

export interface ItemStepTime {
  stepIndex: number; // index into item.steps
  phase: StepPhaseName;
  isAlongside: boolean;
  startAt: EpochMs;
  endAt: EpochMs;
}

/**
 * Places every step of one item. `ovenStartAt` is when its oven phase begins (ignored, and
 * `readyAt` is used as the end of the chain, when the recipe has no oven phase). Steps before the
 * oven phase run backward from it; oven and tail steps run forward from it; alongside steps are
 * placed from their anchor (ADR 0010 sections 1 and 2). Alongside steps anchored to an oven or
 * tail step get phase 'oven' or 'tail' like their anchor.
 */
export function layoutItem(
  p: PreparedItem,
  ovenStartAt: EpochMs,
  readyAt: EpochMs,
): ItemStepTime[] {
  const steps = p.input.steps;
  const dur = (i: number) => minutesOf(p, steps[i]!) * MIN_MS;
  const times = new Map<number, ItemStepTime>();
  const set = (stepIndex: number, phase: StepPhaseName, startAt: EpochMs, isAlongside = false) => {
    times.set(stepIndex, {
      stepIndex,
      phase,
      isAlongside,
      startAt,
      endAt: startAt + dur(stepIndex),
    });
  };

  const phase = p.phase;
  let preIdx: number[];
  let chainEnd: EpochMs;
  if (phase) {
    const firstOven = phase.indexes[0]!;
    preIdx = p.seqIdx.slice(0, p.seqIdx.indexOf(firstOven));
    chainEnd = ovenStartAt;
    let cursor = ovenStartAt;
    for (const i of phase.indexes) {
      set(i, 'oven', cursor);
      cursor += dur(i);
    }
    for (const i of phase.tailIndexes) {
      set(i, 'tail', cursor);
      cursor += dur(i);
    }
  } else {
    preIdx = p.seqIdx;
    chainEnd = readyAt;
  }
  let cursor = chainEnd;
  for (let k = preIdx.length - 1; k >= 0; k--) {
    const i = preIdx[k]!;
    cursor -= dur(i);
    set(i, 'pre', cursor);
  }

  steps.forEach((s, i) => {
    if (s.anchor.type !== 'alongside') return;
    const anchor = times.get(steps.findIndex((x) => x.id === (s.anchor as { stepId: Id }).stepId));
    if (!anchor) throw new CoreInvariantError(`alongside anchor not placed for step ${s.id}`);
    const a = s.anchor;
    const offset = (a.offsetMin ?? 0) * MIN_MS;
    const d = dur(i);
    let startAt: EpochMs;
    if (a.align === 'endsAtStart') startAt = anchor.startAt + offset - d;
    else if (a.align === 'startsAtStart') startAt = anchor.startAt + offset;
    else startAt = anchor.endAt + offset - d;
    set(i, anchor.phase, startAt, true);
  });

  return [...times.values()];
}

// Whole plan (one or many oven slots; ADR 0009)

interface Entry {
  step: PlannedStep;
  itemIdx: number;
  stepIdx: number;
  choice: DurationChoice | null;
  mergeablePreheat: boolean;
}

function buildPlan(
  prepared: readonly PreparedItem[],
  input: PlanInput,
  readyAt: EpochMs,
  mode: 'backward' | 'forward',
): BakePlan {
  const ovenItems = prepared.filter((p) => p.phase !== null);
  const assigned = assignOvenSlots(
    ovenItems.map((p) => ({ itemId: p.input.itemId, loaves: p.input.loaves })),
    input.ovenCapacity,
  );
  const timing = new Map<Id, ItemOvenTiming>(
    ovenItems.map((p) => [p.input.itemId, { ovenMin: p.ovenMin, tailMin: p.tailMin }]),
  );
  const slots = layoutSlots(
    assigned,
    timing,
    readyAt,
    input.reheatGapMin ?? DEFAULT_REHEAT_GAP_MIN,
  );
  const firstSlotIndex = slots[0]?.index ?? 1;

  const entries: Entry[] = [];
  for (const p of prepared) {
    const steps = p.input.steps;
    // One oven track per slot that holds some of this item's loaves (ADR 0009 section 6).
    const tracks = slots
      .map((s) => ({
        slot: s,
        loaves: s.loaves.find((l) => l.itemId === p.input.itemId)?.loaves ?? 0,
      }))
      .filter((t) => t.loaves > 0);
    const first = tracks[0];
    const times = layoutItem(p, first ? first.slot.startAt : readyAt, readyAt);
    const placed: {
      t: ItemStepTime;
      slotIndex: number | null;
      loaves: number | null;
      of: number;
    }[] = times.map((t) => ({
      t,
      slotIndex: t.phase !== 'pre' && first ? first.slot.index : null,
      loaves: t.phase !== 'pre' && first ? first.loaves : null,
      of: p.input.loaves,
    }));
    for (const track of tracks.slice(1)) {
      for (const t of layoutItem(p, track.slot.startAt, readyAt)) {
        if (t.phase !== 'pre')
          placed.push({ t, slotIndex: track.slot.index, loaves: track.loaves, of: p.input.loaves });
      }
    }

    for (const { t, slotIndex, loaves } of placed) {
      const s = steps[t.stepIndex]!;
      const choice = p.choices[s.id]!;
      const inSlot = slotIndex !== null;
      const folds = s.folds
        ? Array.from({ length: s.folds.count }, (_, k) => ({
            index: k + 1,
            at: t.startAt + k * s.folds!.intervalMin * MIN_MS,
          }))
        : [];
      const anchorStep =
        s.anchor.type === 'alongside'
          ? steps.find((x) => x.id === (s.anchor as { stepId: Id }).stepId)
          : undefined;
      const anchorTime = anchorStep
        ? times.find((x) => steps[x.stepIndex] === anchorStep)
        : undefined;
      const keyOf = (id: Id, ph: StepPhaseName | undefined) =>
        ph && ph !== 'pre' && slotIndex !== null
          ? `${p.input.itemId}:${id}:s${slotIndex}`
          : `${p.input.itemId}:${id}`;
      const step: PlannedStep = {
        key: keyOf(s.id, t.phase),
        itemId: p.input.itemId,
        stepId: s.id,
        slotIndex,
        name: s.name,
        kind: s.kind,
        isAlongside: t.isAlongside,
        startAt: t.startAt,
        endAt: t.endAt,
        durationMin: choice.minutes,
        minMin: s.folds ? choice.minutes : s.minMin,
        maxMin: s.folds ? choice.minutes : s.maxMin,
        durationSource: choice.source,
        folds,
        notify: s.notify,
        loaves: inSlot ? loaves : null,
      };
      if (s.anchor.type === 'alongside' && anchorStep) {
        step.anchor = { key: keyOf(anchorStep.id, anchorTime?.phase), align: s.anchor.align };
      }
      entries.push({
        itemIdx: p.index,
        stepIdx: t.stepIndex,
        choice,
        mergeablePreheat: s.kind === 'preheat' && anchorStep?.kind === 'bake',
        step,
      });
    }
  }

  // One merged preheat per bake, before the first slot only (ADR 0009 section 7). Preheats of
  // later slots are dropped; among the first slot's, the earliest-starting one is kept.
  const mergeable = entries.filter((e) => e.mergeablePreheat);
  let kept = entries;
  if (mergeable.length > 0) {
    const firstSlot = mergeable.filter((e) => e.step.slotIndex === firstSlotIndex);
    const pool = firstSlot.length > 0 ? firstSlot : mergeable;
    const winner = pool.reduce((a, b) => (b.step.startAt < a.step.startAt ? b : a));
    winner.step = {
      ...winner.step,
      key: 'bake:preheat',
      itemId: null,
      stepId: null,
      slotIndex: null,
      name: prepared[winner.itemIdx]!.input.steps[winner.stepIdx]!.name,
      loaves: null,
    };
    kept = entries.filter((e) => !e.mergeablePreheat || e === winner);
  }

  // Reheat pseudo-steps between slots (ADR 0009 section 7), only when the gap is positive.
  const gapMin = input.reheatGapMin ?? DEFAULT_REHEAT_GAP_MIN;
  const reheat: Entry[] = [];
  if (gapMin > 0) {
    for (let k = 1; k < slots.length; k++) {
      const slot = slots[k]!;
      reheat.push({
        itemIdx: Number.MAX_SAFE_INTEGER,
        stepIdx: slot.index,
        choice: null,
        mergeablePreheat: false,
        step: {
          key: `bake:reheat:s${slot.index}`,
          itemId: null,
          stepId: null,
          slotIndex: slot.index,
          name: 'Reheat oven',
          kind: 'preheat',
          isAlongside: true,
          startAt: slot.startAt - gapMin * MIN_MS,
          endAt: slot.startAt,
          durationMin: gapMin,
          minMin: gapMin,
          maxMin: gapMin,
          durationSource: 'default',
          folds: [],
          notify: false,
          loaves: null,
        },
      });
    }
    kept = [...kept, ...reheat];
  }

  kept.sort(
    (a, b) => a.step.startAt - b.step.startAt || a.itemIdx - b.itemIdx || a.stepIdx - b.stepIdx,
  );

  const warnings: PlanWarning[] = [];
  for (const e of kept) {
    if (e.choice && e.choice.clamped && e.choice.unclampedMinutes !== null) {
      warnings.push({
        code: 'temperatureClamped',
        stepKey: e.step.key,
        minutes: e.choice.minutes,
        unclampedMinutes: e.choice.unclampedMinutes,
      });
    }
  }

  const steps = kept.map((e) => e.step);
  warnings.push(...slotWarnings(steps, slots));
  return {
    mode,
    startAt: steps.reduce((m, s) => Math.min(m, s.startAt), Number.POSITIVE_INFINITY),
    readyAt,
    steps,
    slots,
    warnings,
  };
}

function ceilTo(ms: number, unit: number): number {
  return Math.ceil(ms / unit) * unit;
}

/** Total span (first start, including alongside steps, to ready) at the chosen durations. */
export function planSpanMin(input: PlanInput): Result<Minutes, StepValidationError[]> {
  const prepared = prepareItems(input);
  if (!prepared.ok) return err(prepared.error);
  const plan = buildPlan(prepared.value, input, 0, 'backward');
  return ok((plan.readyAt - plan.startAt) / MIN_MS);
}

/** now + span, rounded UP to the next 5 minutes (AMB-08). Same as requested + (now - firstStart). */
export function earliestReadyAt(
  input: PlanInput,
  now: EpochMs,
): Result<EpochMs, StepValidationError[]> {
  const span = planSpanMin(input);
  if (!span.ok) return err(span.error);
  return ok(ceilTo(now + span.value * MIN_MS, READY_ROUND_MS));
}

export function planBake(input: PlanInput, request: PlanRequest): PlanResult {
  const prepared = prepareItems(input);
  if (!prepared.ok) return { status: 'invalid', errors: prepared.error };
  const items = prepared.value;

  if (request.mode === 'forward') {
    // "Start now": the same chain run from startAt. Equivalent to a backward pass whose ready
    // time is startAt + span, so the earliest step starts exactly at startAt.
    const base = buildPlan(items, input, 0, 'backward');
    const plan = buildPlan(
      items,
      input,
      request.startAt + (base.readyAt - base.startAt),
      'forward',
    );
    return { status: 'ok', plan };
  }

  const plan = buildPlan(items, input, request.readyAt, 'backward');
  if (plan.startAt >= request.now) return { status: 'ok', plan };

  const earliest = ceilTo(request.readyAt + (request.now - plan.startAt), READY_ROUND_MS);
  return {
    status: 'tooSoon',
    requestedReadyAt: request.readyAt,
    earliestReadyAt: earliest,
    plan: buildPlan(items, input, earliest, 'backward'),
  };
}
