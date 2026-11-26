// Live recompute (docs/core-api.md 5.6, ADR 0010 section 7, AMB-11).
//
// Policy: PURE SHIFT, both directions. When a step starts or ends off plan, every later step of
// THAT item (sequential steps, alongside steps anchored to them, folds, later oven slots) moves
// by the same delta, and the ready time moves with it. Nothing is absorbed silently: "Hold ready
// time" and "+15 min" are explicit `extend` events chosen by the baker.
//
// Pure: inputs are never mutated, no clock is read (callers pass `now` through the options).

import { err, ok, type EpochMs, type Id, type IanaZone, type Minutes, type Result } from '../types';
import type { BakePlan, PlannedStep, PlanWarning } from './backward';
import { deriveSlots, holdStepOf, slotWarnings } from './multi';
import { quietHoursWarnings, type QuietHours } from './quiet';

const MIN_MS = 60_000;

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped';
export interface StepProgress {
  key: string;
  status: StepStatus;
  actualStartAt: EpochMs | null;
  actualEndAt: EpochMs | null;
  inferredDone: boolean;
  foldTimes: EpochMs[]; // actual fold times, index 0 = fold 1
}
export type RecomputeEvent =
  | { type: 'stepStarted'; key: string; at: EpochMs }
  | { type: 'stepDone'; key: string; at: EpochMs }
  | { type: 'foldDone'; key: string; foldIndex: number; at: EpochMs }
  | { type: 'extend'; key: string; minutes: Minutes };

export interface RecomputeContext {
  /**
   * The current instant. When an early finish would pull unstarted steps before `now`, they are
   * held at `now` instead (LIV-16), and shifted alongside steps never start before it.
   */
  now?: EpochMs;
  /** With `zone`, quiet-hours warnings are re-run on the steps that have not started yet; otherwise the caller does it. */
  quiet?: QuietHours;
  zone?: IanaZone;
}

export interface RecomputeResult {
  plan: BakePlan;
  progress: StepProgress[];
  shiftedKeys: string[];
  deltaMin: Minutes;
}
export type RecomputeError = {
  code: 'unknownStep' | 'alreadyDone' | 'invalidFoldIndex' | 'notAFoldStep';
  key: string;
};

const isFinal = (s: StepStatus) => s === 'done' || s === 'skipped';

function blank(key: string): StepProgress {
  return {
    key,
    status: 'pending',
    actualStartAt: null,
    actualEndAt: null,
    inferredDone: false,
    foldTimes: [],
  };
}

function cloneStep(s: PlannedStep): PlannedStep {
  return {
    ...s,
    folds: s.folds.map((f) => ({ ...f })),
    ...(s.anchor ? { anchor: { ...s.anchor } } : {}),
  };
}

function moveBy(s: PlannedStep, d: number): void {
  s.startAt += d;
  s.endAt += d;
  for (const f of s.folds) f.at += d;
}

function setDuration(s: PlannedStep): void {
  s.durationMin = Math.round((s.endAt - s.startAt) / MIN_MS);
}

/** Start of an oven slot as seen from its bake steps; null when it has none. */
function slotStartOf(steps: readonly PlannedStep[], slotIndex: number): number | null {
  const starts = steps
    .filter((s) => s.slotIndex === slotIndex && !s.isAlongside && s.kind === 'bake')
    .map((s) => s.startAt);
  return starts.length > 0 ? Math.min(...starts) : null;
}

function itemReadyAt(steps: readonly PlannedStep[], itemId: Id): number {
  return Math.max(
    ...steps.filter((s) => s.itemId === itemId && !s.isAlongside).map((s) => s.endAt),
  );
}

function maxItemReady(steps: readonly PlannedStep[]): number {
  const ids = [...new Set(steps.filter((s) => s.itemId !== null).map((s) => s.itemId as Id))];
  return ids.length === 0
    ? Number.NEGATIVE_INFINITY
    : Math.max(...ids.map((i) => itemReadyAt(steps, i)));
}

export function recomputePlan(
  plan: BakePlan,
  progress: readonly StepProgress[],
  event: RecomputeEvent,
  ctx: RecomputeContext = {},
): Result<RecomputeResult, RecomputeError> {
  const key = event.key;
  const pIdx = plan.steps.findIndex((s) => s.key === key);
  if (pIdx < 0) return err({ code: 'unknownStep', key });

  const prog = new Map<string, StepProgress>();
  for (const p of progress) prog.set(p.key, { ...p, foldTimes: [...p.foldTimes] });
  const progOf = (k: string): StepProgress => {
    let p = prog.get(k);
    if (!p) {
      p = blank(k);
      prog.set(k, p);
    }
    return p;
  };
  if (isFinal(progOf(key).status)) return err({ code: 'alreadyDone', key });

  const steps = plan.steps.map(cloneStep);
  const P = steps[pIdx]!;
  const orig = plan.steps[pIdx]!;
  if (event.type === 'foldDone') {
    if (P.folds.length === 0) return err({ code: 'notAFoldStep', key });
    if (
      !Number.isInteger(event.foldIndex) ||
      event.foldIndex < 1 ||
      event.foldIndex > P.folds.length
    ) {
      return err({ code: 'invalidFoldIndex', key });
    }
  }

  const startShift = new Map<string, number>();
  const endShift = new Map<string, number>();
  const isChain = P.itemId !== null && !P.isAlongside;
  const pr = progOf(key);

  // --- the event itself -----------------------------------------------------------------------
  let laterDelta = 0;
  let eventAt: EpochMs | null = null;
  switch (event.type) {
    case 'stepStarted': {
      const d = event.at - P.startAt;
      moveBy(P, d);
      startShift.set(P.key, d);
      endShift.set(P.key, d);
      laterDelta = isChain ? d : 0;
      pr.status = 'active';
      pr.actualStartAt = event.at;
      eventAt = event.at;
      break;
    }
    case 'stepDone': {
      const d = event.at - P.endAt;
      P.startAt = Math.min(P.startAt, event.at);
      P.endAt = event.at;
      setDuration(P);
      endShift.set(P.key, d);
      laterDelta = isChain ? d : 0;
      pr.status = 'done';
      pr.actualEndAt = event.at;
      eventAt = event.at;
      break;
    }
    case 'foldDone': {
      const n = event.foldIndex;
      const count = P.folds.length;
      const interval = P.minMin / count; // fold steps: min = max = count * interval
      for (let j = n + 1; j <= count; j++)
        P.folds[j - 1]!.at = event.at + (j - n) * interval * MIN_MS;
      const newEnd = event.at + (count - n + 1) * interval * MIN_MS;
      const d = newEnd - P.endAt;
      P.endAt = newEnd;
      setDuration(P);
      endShift.set(P.key, d);
      laterDelta = isChain ? d : 0;
      if (pr.status === 'pending') pr.status = 'active';
      while (pr.foldTimes.length < n - 1) pr.foldTimes.push(orig.folds[pr.foldTimes.length]!.at);
      pr.foldTimes[n - 1] = event.at;
      eventAt = event.at;
      break;
    }
    case 'extend': {
      const d = Math.max(event.minutes, -P.durationMin) * MIN_MS; // a step can't get shorter than nothing
      P.endAt += d;
      setDuration(P);
      endShift.set(P.key, d);
      laterDelta = isChain ? d : 0;
      break;
    }
  }

  // --- later steps of the same item -----------------------------------------------------------
  if (isChain) {
    const chain = steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.itemId === P.itemId && !s.isAlongside)
      .sort((a, b) => (a.s.slotIndex ?? 0) - (b.s.slotIndex ?? 0) || a.i - b.i)
      .map(({ s }) => s);
    const pos = chain.indexOf(P);

    if (event.type !== 'extend') {
      // Out-of-order progress: earlier unfinished steps are inferred done (ADR 0010 section 7).
      for (const s of chain.slice(0, pos)) {
        const sp = progOf(s.key);
        if (!isFinal(sp.status)) {
          sp.status = 'done';
          sp.inferredDone = true;
        }
      }
    }

    const later = chain.slice(pos + 1).filter((s) => !isFinal(progOf(s.key).status));
    if (ctx.now !== undefined && laterDelta < 0) {
      const first = later.find((s) => progOf(s.key).status === 'pending');
      if (first) laterDelta = Math.min(0, Math.max(laterDelta, ctx.now - first.startAt));
    }
    if (laterDelta !== 0) {
      for (const s of later) {
        if (progOf(s.key).status !== 'pending') continue;
        moveBy(s, laterDelta);
        startShift.set(s.key, laterDelta);
        endShift.set(s.key, laterDelta);
      }
    }

    // Alongside steps follow their anchor (an extend of the anchor moves only its end).
    for (const s of steps) {
      if (s === P || s.itemId !== P.itemId || !s.isAlongside || progOf(s.key).status !== 'pending')
        continue;
      let d = 0;
      if (s.anchor) {
        d =
          (s.anchor.align === 'endsAtEnd'
            ? endShift.get(s.anchor.key)
            : startShift.get(s.anchor.key)) ?? 0;
      } else if (s.startAt >= orig.endAt) {
        d = laterDelta; // plan without anchor info: follow anything that starts after the finished step
      }
      if (d !== 0) {
        moveBy(s, d);
        startShift.set(s.key, d);
        endShift.set(s.key, d);
      }
    }

    // Bake-wide steps follow their slot: the merged preheat the first oven slot, a reheat its slot.
    for (const s of steps) {
      if (s.itemId !== null || progOf(s.key).status !== 'pending') continue;
      let k: number | null = null;
      if (s.key === 'bake:preheat') {
        const idx = plan.steps
          .filter((x) => x.slotIndex !== null && x.kind === 'bake')
          .map((x) => x.slotIndex as number);
        k = idx.length > 0 ? Math.min(...idx) : null;
      } else if (s.key.startsWith('bake:reheat:s')) {
        k = s.slotIndex;
      }
      if (k === null) continue;
      const before = slotStartOf(plan.steps, k);
      const after = slotStartOf(steps, k);
      if (before !== null && after !== null && after !== before) {
        moveBy(s, after - before);
        startShift.set(s.key, after - before);
      }
    }
  }

  // Shifted steps never start before the moment the baker acted (or `now`).
  const floor = ctx.now ?? eventAt;
  if (floor !== null) {
    for (const s of steps) {
      if (
        s === P ||
        !s.isAlongside ||
        (startShift.get(s.key) ?? 0) >= 0 ||
        progOf(s.key).status !== 'pending'
      )
        continue;
      if (s.startAt < floor) {
        s.startAt = floor;
        s.endAt = Math.max(s.endAt, floor);
        setDuration(s);
      }
    }
  }

  // --- assemble -------------------------------------------------------------------------------
  const order = new Map(steps.map((s, i) => [s, i]));
  steps.sort((a, b) => a.startAt - b.startAt || order.get(a)! - order.get(b)!);

  const byKeyBefore = new Map(plan.steps.map((s) => [s.key, s]));
  const shiftedKeys = steps
    .filter((s) => {
      const o = byKeyBefore.get(s.key)!;
      return (
        o.startAt !== s.startAt ||
        o.endAt !== s.endAt ||
        s.folds.some((f, i) => f.at !== o.folds[i]!.at)
      );
    })
    .map((s) => s.key);

  const slots = deriveSlots(steps, plan.slots);
  const warnings: PlanWarning[] = plan.warnings.filter((w) => w.code === 'temperatureClamped');
  for (const s of steps) {
    if (s.itemId === null || s.folds.length > 0 || isFinal(progOf(s.key).status)) continue;
    if (s.durationMin < s.minMin || s.durationMin > s.maxMin) {
      warnings.push({ code: 'durationOutOfRange', stepKey: s.key, minutes: s.durationMin });
    }
  }
  warnings.push(...slotWarnings(steps, slots));

  const result: BakePlan = {
    mode: plan.mode,
    startAt: steps.reduce((m, s) => Math.min(m, s.startAt), Number.POSITIVE_INFINITY),
    readyAt: plan.readyAt + (maxItemReady(steps) - maxItemReady(plan.steps) || 0),
    steps,
    slots,
    warnings,
  };
  if (ctx.zone) {
    const notStarted = {
      ...result,
      steps: steps.filter((s) => progOf(s.key).status === 'pending'),
    };
    if (ctx.quiet) warnings.push(...quietHoursWarnings(notStarted, ctx.quiet, ctx.zone));
  }

  const itemId = P.itemId;
  const deltaMin =
    itemId === null
      ? 0
      : Math.round((itemReadyAt(steps, itemId) - itemReadyAt(plan.steps, itemId)) / MIN_MS);

  const seen = new Set<string>();
  const outProgress: StepProgress[] = [];
  for (const p of progress) {
    outProgress.push(prog.get(p.key)!);
    seen.add(p.key);
  }
  for (const [k, p] of prog) if (!seen.has(k)) outProgress.push(p);

  return ok({ plan: result, progress: outProgress, shiftedKeys, deltaMin });
}

/**
 * How much the item's hold step (cold ferment) can absorb without leaving its [minMin, maxMin]
 * range, for the "Hold ready time" button. Both values are non-negative minutes.
 *  - `canAbsorbEarlyMin`: the item finishes EARLY; the hold step is lengthened (up to maxMin).
 *  - `canAbsorbLateMin`: the item runs LATE; the hold step is shortened (down to minMin).
 * Null when the item has no hold step (no oven phase, or nothing before it).
 */
export function holdCapacity(
  plan: BakePlan,
  itemId: Id,
): { holdKey: string; canAbsorbEarlyMin: Minutes; canAbsorbLateMin: Minutes } | null {
  const hold = holdStepOf(plan.steps, itemId);
  if (!hold) return null;
  return {
    holdKey: hold.key,
    canAbsorbEarlyMin: Math.max(0, hold.maxMin - hold.durationMin),
    canAbsorbLateMin: Math.max(0, hold.durationMin - hold.minMin),
  };
}
