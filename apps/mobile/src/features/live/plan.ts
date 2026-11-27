/**
 * Rows to core and back (architecture section 5, ADR 0014). The bake is stored as `bake_step`
 * rows; core wants a `BakePlan` plus `StepProgress[]`. This module rebuilds them without loss for
 * everything `recomputePlan` reads, and turns a recompute result into the smallest set of row
 * updates. Pure: tests run it over fixtures.
 */
import {
  fromIso,
  toIso,
  type BakePlan,
  type OvenSlot,
  type PlannedFold,
  type PlannedStep,
  type RecomputeResult,
  type StepProgress,
  type StepTemplate,
} from '@sourdough/core';
import type { BakeStepUpdate } from '../../db/repositories';
import type { BakeAggregate, BakeStep } from '../../db/types';

const MIN_MS = 60_000;

/** The order core chains an item's sequential steps in: oven slot, then start time, then position. */
export function chainOrder(a: BakeStep, b: BakeStep): number {
  return (
    (a.slotIndex ?? 0) - (b.slotIndex ?? 0) ||
    fromIso(a.plannedStartAt) - fromIso(b.plannedStartAt) ||
    a.position - b.position
  );
}

/** An item's sequential steps in chain order. */
export function sequentialSteps(aggregate: BakeAggregate, itemId: string): BakeStep[] {
  return aggregate.steps.filter((s) => s.bakeItemId === itemId && !s.isAlongside).sort(chainOrder);
}

/** Fold times for a fold step: done folds at their actual times, the rest re-anchored from the last one. */
export function foldTimesOf(row: BakeStep): PlannedFold[] {
  const count = row.foldCount ?? 0;
  const interval = (row.foldIntervalMin ?? 0) * MIN_MS;
  if (count === 0 || interval === 0) return [];
  const done = Math.min(row.foldsDone, row.foldTimes.length, count);
  const start = fromIso(row.plannedStartAt);
  const base = done === 0 ? start : fromIso(row.foldTimes[done - 1] as string);
  return Array.from({ length: count }, (_, k) => {
    const index = k + 1;
    if (index <= done) return { index, at: fromIso(row.foldTimes[k] as string) };
    return { index, at: done === 0 ? start + k * interval : base + (index - done) * interval };
  });
}

/**
 * The step an alongside step follows. Core keys oven-phase steps with `:s<slot>`, and an alongside
 * step shares its anchor's phase, so the anchor's key is derived from the row's own slot.
 */
export function anchorOf(
  row: BakeStep,
  templates: readonly StepTemplate[] | undefined,
): PlannedStep['anchor'] {
  if (!row.isAlongside || !row.bakeItemId) return undefined;
  const template = templates?.find((s) => s.id === row.sourceStepId);
  if (template?.anchor.type !== 'alongside') return undefined;
  const suffix = row.slotIndex !== null ? `:s${row.slotIndex}` : '';
  return {
    key: `${row.bakeItemId}:${template.anchor.stepId}${suffix}`,
    align: template.anchor.align,
  };
}

export interface RowPlan {
  plan: BakePlan;
  progress: StepProgress[];
  /** Plan steps' rows by key. */
  rows: Map<string, BakeStep>;
}

/** Rebuilds the core plan and progress from a bake's rows. */
export function toBakePlan(aggregate: BakeAggregate): RowPlan {
  const { bake } = aggregate;
  const templates = new Map(
    aggregate.items.map((item) => [item.id, item.recipeSnapshot.steps] as const),
  );
  const loavesBySlot = new Map<string, number>();
  for (const slot of bake.ovenSlots) {
    for (const l of slot.loaves) loavesBySlot.set(`${slot.index}:${l.bakeItemId}`, l.loaves);
  }

  const ordered = [...aggregate.steps].sort(
    (a, b) => fromIso(a.plannedStartAt) - fromIso(b.plannedStartAt) || a.position - b.position,
  );
  const rows = new Map<string, BakeStep>();
  const steps: PlannedStep[] = ordered.map((row) => {
    rows.set(row.stepKey, row);
    const step: PlannedStep = {
      key: row.stepKey,
      itemId: row.bakeItemId,
      stepId: row.sourceStepId,
      slotIndex: row.slotIndex,
      name: row.name,
      kind: row.kind,
      isAlongside: row.isAlongside,
      startAt: fromIso(row.plannedStartAt),
      endAt: fromIso(row.plannedEndAt),
      durationMin: row.durationMin,
      minMin: row.minMin,
      maxMin: row.maxMin,
      durationSource: row.durationSource,
      folds: foldTimesOf(row),
      notify: row.notify,
      loaves:
        row.slotIndex !== null && row.bakeItemId
          ? (loavesBySlot.get(`${row.slotIndex}:${row.bakeItemId}`) ?? null)
          : null,
    };
    const anchor = anchorOf(row, templates.get(row.bakeItemId ?? ''));
    if (anchor) step.anchor = anchor;
    return step;
  });

  const slots: OvenSlot[] = bake.ovenSlots.map((slot) => ({
    index: slot.index,
    startAt: fromIso(slot.startAt),
    endAt: fromIso(slot.endAt),
    loaves: slot.loaves.map((l) => ({ itemId: l.bakeItemId, loaves: l.loaves })),
  }));

  const plan: BakePlan = {
    mode: bake.mode,
    startAt: steps.reduce((m, s) => Math.min(m, s.startAt), Number.POSITIVE_INFINITY),
    readyAt: fromIso(bake.plannedReadyAt),
    steps,
    slots,
    warnings: [],
  };
  const progress: StepProgress[] = ordered.map((row) => ({
    key: row.stepKey,
    status: row.status,
    actualStartAt: row.actualStartAt ? fromIso(row.actualStartAt) : null,
    actualEndAt: row.actualEndAt ? fromIso(row.actualEndAt) : null,
    inferredDone: row.inferredDone,
    foldTimes: row.foldTimes.map(fromIso),
  }));
  return { plan, progress, rows };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Only the rows a recompute changed, with every column a live event can touch. */
export function rowUpdates(
  rows: ReadonlyMap<string, BakeStep>,
  result: RecomputeResult,
): BakeStepUpdate[] {
  const progress = new Map(result.progress.map((p) => [p.key, p]));
  const updates: BakeStepUpdate[] = [];
  for (const step of result.plan.steps) {
    const row = rows.get(step.key);
    const p = progress.get(step.key);
    if (!row || !p) continue;
    const next = {
      durationMin: step.durationMin,
      plannedStartAt: toIso(step.startAt),
      plannedEndAt: toIso(step.endAt),
      actualStartAt: p.actualStartAt === null ? null : toIso(p.actualStartAt),
      actualEndAt: p.actualEndAt === null ? null : toIso(p.actualEndAt),
      status: p.status,
      inferredDone: p.inferredDone,
      foldsDone: p.foldTimes.length,
      foldTimes: p.foldTimes.map(toIso),
    };
    const changed =
      row.durationMin !== next.durationMin ||
      row.plannedStartAt !== next.plannedStartAt ||
      row.plannedEndAt !== next.plannedEndAt ||
      row.actualStartAt !== next.actualStartAt ||
      row.actualEndAt !== next.actualEndAt ||
      row.status !== next.status ||
      row.inferredDone !== next.inferredDone ||
      row.foldsDone !== next.foldsDone ||
      !sameList(row.foldTimes, next.foldTimes);
    if (changed) updates.push({ id: row.id, ...next });
  }
  return updates;
}
