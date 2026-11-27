/**
 * What a bake looks like right now (screens-bake.md 1.1, 8.1): the current step per item, the
 * phase, what is next and how far along it is. Pure functions of the rows and `now`, shared by
 * the home list and the live view. No step is "started" by the clock in the database: the UI
 * derives it (architecture 9.1 Q-A4).
 */
import { fromIso } from '@sourdough/core';
import type { BakeAggregate, BakeStatus, BakeStep } from '../../db/types';
import { letterFor } from '../schedule/labels';
import { anchorOf, chainOrder, foldTimesOf, sequentialSteps } from './plan';

const MIN_MS = 60_000;
/** A fold counts as overdue this long after its time (screens-bake.md 8.4). */
export const FOLD_OVERDUE_MS = 5 * MIN_MS;
/** Ready-time card appears from this change (screens-bake.md 8.1). */
export const READY_MOVED_MIN = 5;
/** "Finished earlier? Set the time" appears from this much overtime. */
export const FINISHED_EARLIER_MS = 15 * MIN_MS;

export type ItemPhase = 'waiting' | 'running' | 'overtime' | 'ready' | 'done';
export type BakePhase = 'waiting' | 'running' | 'overtime' | 'ready' | 'complete';

export interface FoldState {
  count: number;
  doneCount: number;
  /** The fold the baker does next (1-based), or null once every fold is done. */
  next: number | null;
  /** When that fold is due. */
  at: number | null;
  /** The fold time has arrived. */
  due: boolean;
}

export interface ItemLive {
  itemId: string;
  index: number;
  letter: string;
  name: string;
  loaves: number;
  steps: BakeStep[];
  phase: ItemPhase;
  /** The step in progress, or (waiting) the step that starts next. Null when the item is done. */
  current: BakeStep | null;
  /** 1-based position of `current` among the item's sequential steps. */
  stepNumber: number;
  stepCount: number;
  /** The step after `current`, or null on the last one. */
  next: BakeStep | null;
  isFinal: boolean;
  fold: FoldState | null;
  /** What the countdown runs to: the step end, the next fold, or (waiting) the step start. */
  targetAt: number | null;
  /** Milliseconds past the target while overtime (a fold gets a 5 min grace first); 0 otherwise. */
  overMs: number;
  /** When the item's last step ended or is due to end. */
  readyAt: number;
  /** Change from the first plan, in whole minutes (positive = later). */
  deltaMin: number;
  /** The final step's planned end once it has passed (phase `ready`). */
  readySince: number | null;
  /** Latest actual or planned end among finished steps (phase `done`). */
  doneAt: number | null;
}

export type RowState = 'done' | 'inferred' | 'current' | 'overtime' | 'upcoming' | 'notMarked';

export interface BakeLive {
  status: BakeStatus;
  phase: BakePhase;
  items: ItemLive[];
  /** Alongside and bake-wide steps that are due and whose anchor hasn't started. */
  alsoNow: BakeStep[];
  /** Every step in start order with its state, for the "Coming up" list. */
  timeline: Array<{ step: BakeStep; state: RowState }>;
  /** The earliest step that starts after now (not the current ones). */
  next: BakeStep | null;
  startAt: number;
  readyAt: number;
  originalReadyAt: number;
  /** 0 to 1. */
  progress: number;
  overtimeCount: number;
  /** The item to show on a card: overtime first, then the soonest end. */
  urgent: ItemLive | null;
  /** The earliest planned start (the card's "First: ..." step). */
  first: BakeStep | null;
}

const startOf = (s: BakeStep) => fromIso(s.plannedStartAt);
const endOf = (s: BakeStep) => fromIso(s.plannedEndAt);
const isFinalStatus = (s: BakeStep) => s.status === 'done' || s.status === 'skipped';

function deriveItem(
  aggregate: BakeAggregate,
  item: BakeAggregate['items'][number],
  index: number,
  now: number,
): ItemLive {
  const steps = sequentialSteps(aggregate, item.id);
  const openSteps = steps.filter((s) => !isFinalStatus(s));
  const active = openSteps.find((s) => s.status === 'active');
  const duePending = openSteps.find((s) => s.status === 'pending' && startOf(s) <= now);
  const running = active ?? duePending ?? null;
  const upcoming = running ? null : (openSteps.find((s) => s.status === 'pending') ?? null);
  const current = running ?? upcoming;
  const lastStep = steps[steps.length - 1] ?? null;
  const stepIndex = current ? steps.indexOf(current) : -1;
  const next = stepIndex >= 0 ? (steps[stepIndex + 1] ?? null) : null;
  const isFinal = current !== null && current === lastStep;

  const readyAt = steps.reduce((m, s) => Math.max(m, endOf(s)), 0);
  const originalReadyAt = lastStep
    ? fromIso(lastStep.originalPlannedStartAt) + lastStep.durationMin * MIN_MS
    : readyAt;

  let fold: FoldState | null = null;
  if (current && (current.foldCount ?? 0) > 0) {
    const folds = foldTimesOf(current);
    const doneCount = Math.min(current.foldsDone, folds.length);
    const at = folds[doneCount]?.at ?? null;
    fold = {
      count: folds.length,
      doneCount,
      next: at === null ? null : doneCount + 1,
      at,
      due: at !== null && at <= now,
    };
  }

  let phase: ItemPhase = 'done';
  let targetAt: number | null = null;
  let overMs = 0;
  let readySince: number | null = null;
  if (current) {
    if (!running) {
      phase = 'waiting';
      targetAt = startOf(current);
    } else if (isFinal && now > endOf(current)) {
      phase = 'ready';
      readySince = endOf(current);
      targetAt = endOf(current);
    } else {
      targetAt = fold && fold.at !== null ? fold.at : endOf(current);
      const grace = fold && fold.at !== null ? FOLD_OVERDUE_MS : 0;
      const past = now - targetAt;
      overMs = past > grace ? past : 0;
      phase = overMs > 0 ? 'overtime' : 'running';
    }
  }

  const doneEnds = steps
    .filter(isFinalStatus)
    .map((s) => (s.actualEndAt ? fromIso(s.actualEndAt) : endOf(s)));
  return {
    itemId: item.id,
    index,
    letter: letterFor(index),
    name: item.recipeSnapshot.recipe.name,
    loaves: item.loaves,
    steps,
    phase,
    current,
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : steps.length,
    stepCount: steps.length,
    next,
    isFinal,
    fold,
    targetAt,
    overMs,
    readyAt,
    deltaMin: Math.round((readyAt - originalReadyAt) / MIN_MS),
    readySince,
    doneAt: phase === 'done' && doneEnds.length > 0 ? Math.max(...doneEnds) : null,
  };
}

/** The row an alongside or bake-wide step is tied to, to tell whether it has started. */
function anchorStarted(aggregate: BakeAggregate, row: BakeStep): boolean {
  if (row.bakeItemId) {
    const item = aggregate.items.find((i) => i.id === row.bakeItemId);
    const anchor = anchorOf(row, item?.recipeSnapshot.steps);
    const target = anchor ? aggregate.steps.find((s) => s.stepKey === anchor.key) : undefined;
    return target ? target.status !== 'pending' : false;
  }
  // Bake-wide: the merged preheat follows the earliest first-slot bake step, a reheat its slot.
  const bakeSteps = aggregate.steps.filter(
    (s) => s.kind === 'bake' && !s.isAlongside && s.slotIndex !== null,
  );
  const slot =
    row.stepKey === 'bake:preheat'
      ? Math.min(...bakeSteps.map((s) => s.slotIndex ?? 1))
      : row.slotIndex;
  const tied = bakeSteps.filter((s) => s.slotIndex === slot);
  return tied.some((s) => s.status !== 'pending');
}

export function deriveBakeLive(aggregate: BakeAggregate, now: number): BakeLive {
  const { bake } = aggregate;
  const items = [...aggregate.items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => deriveItem(aggregate, item, index, now));

  const currentKeys = new Map(
    items.filter((i) => i.current).map((i) => [(i.current as BakeStep).id, i] as const),
  );
  const alsoNow = aggregate.steps
    .filter(
      (s) =>
        s.isAlongside &&
        s.status === 'pending' &&
        startOf(s) <= now &&
        !anchorStarted(aggregate, s),
    )
    .sort(chainOrder);
  const alsoIds = new Set(alsoNow.map((s) => s.id));

  const timeline = [...aggregate.steps]
    .sort((a, b) => startOf(a) - startOf(b) || a.position - b.position)
    .map((step) => {
      let state: RowState;
      if (step.status === 'done' || step.status === 'skipped') {
        state = step.inferredDone ? 'inferred' : 'done';
      } else if (currentKeys.has(step.id)) {
        const owner = currentKeys.get(step.id) as ItemLive;
        state =
          owner.phase === 'overtime'
            ? 'overtime'
            : owner.phase === 'waiting'
              ? 'upcoming'
              : 'current';
      } else if (alsoIds.has(step.id)) {
        state = 'current';
      } else if (step.isAlongside && startOf(step) <= now && anchorStarted(aggregate, step)) {
        state = 'notMarked';
      } else {
        state = 'upcoming';
      }
      return { step, state };
    });

  const pending = timeline.filter((t) => t.state === 'upcoming' && startOf(t.step) > now);
  const startAt = aggregate.steps.reduce(
    (m, s) => Math.min(m, startOf(s)),
    Number.POSITIVE_INFINITY,
  );
  const readyAt = fromIso(bake.plannedReadyAt);
  const span = readyAt - startAt;

  const live = items.filter((i) => i.phase !== 'done');
  let phase: BakePhase;
  if (bake.status === 'completed') phase = 'complete';
  else if (items.some((i) => i.phase === 'overtime')) phase = 'overtime';
  else if (items.length > 0 && items.every((i) => i.phase === 'ready' || i.phase === 'done'))
    phase = 'ready';
  else if (
    items.every((i) => i.phase === 'waiting') &&
    aggregate.steps.every((s) => s.status === 'pending')
  ) {
    phase = 'waiting';
  } else phase = 'running';

  const urgent =
    [...live]
      .filter((i) => i.phase !== 'waiting' || phase === 'waiting')
      .sort((a, b) => {
        const rank = (i: ItemLive) => (i.phase === 'overtime' ? 0 : 1);
        return (
          rank(a) - rank(b) ||
          (a.targetAt ?? Infinity) - (b.targetAt ?? Infinity) ||
          a.index - b.index
        );
      })[0] ?? null;

  return {
    status: bake.status,
    phase,
    items,
    alsoNow,
    timeline,
    next: pending[0]?.step ?? null,
    startAt,
    readyAt,
    originalReadyAt: fromIso(bake.originalReadyAt),
    progress: span > 0 ? Math.min(1, Math.max(0, (now - startAt) / span)) : 0,
    overtimeCount: items.filter((i) => i.phase === 'overtime').length,
    urgent,
    first: timeline[0]?.step ?? null,
  };
}

/** Items that need a panel: not finished. */
export const openItems = (live: BakeLive): ItemLive[] =>
  live.items.filter((i) => i.phase !== 'done');
