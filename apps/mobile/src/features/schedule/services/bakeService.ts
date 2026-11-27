/**
 * Bake writes (architecture section 5). RN-06 owns `create`; RN-08 adds `applyEvent`, `revert`,
 * `sweep` and `cancel` next to it. The bake, its items (with recipe and cost snapshots) and its
 * materialized step plan are written in one transaction by the repository (ADR 0014).
 */
import { toIso, type EpochMs, type PlannedStep } from '@sourdough/core';
import type { Repositories } from '../../../db/repositories';
import type {
  BakeAggregate,
  BakeItemInput,
  BakeMode,
  BakeStepInput,
  NewBakeAggregate,
  PantryItem,
  RecipeAggregate,
} from '../../../db/types';
import { logger } from '../../../lib/logger';
import type { Preview } from '../preview';
import { notifyBakeScheduled } from '../sideEffects';
import { createLiveOps, type LiveOps } from '../../live/services/liveOps';
import { buildCostSnapshot, buildRecipeSnapshot, computeItemCost } from '../snapshot';

export interface CreateBakeItem {
  /** Same id the preview used: core's step keys embed it. */
  itemId: string;
  recipe: RecipeAggregate;
  loaves: number;
}

export interface CreateBakeInput {
  /** A preview with status `ok`. */
  preview: Preview;
  mode: BakeMode;
  items: readonly CreateBakeItem[];
  kitchenTempC: number | null;
  ovenCapacity: number;
  reheatGapMin: number;
  headsUpMin: number;
  currencyCode: string;
  markupBps: number;
  sellRoundingCents: number;
  pantryItems: readonly PantryItem[];
  zone: string;
  /** The instant the user tapped Schedule. */
  now: EpochMs;
}

export class BakeNotSchedulableError extends Error {
  constructor() {
    super('The plan is not ready to schedule.');
    this.name = 'BakeNotSchedulableError';
  }
}

const validTemp = (c: number | null): number | null =>
  c !== null && Number.isFinite(c) && c >= 10 && c <= 40 ? c : null;

/** Pure: everything the repository needs to write, so tests can inspect it. */
export function buildNewBake(input: CreateBakeInput): NewBakeAggregate {
  const { preview } = input;
  if (preview.status !== 'ok' || !preview.plan) throw new BakeNotSchedulableError();
  const { plan } = preview;
  const nowIso = toIso(input.now);
  const forward = input.mode === 'forward';
  const itemsById = new Map(input.items.map((item) => [item.itemId, item]));

  const items: BakeItemInput[] = input.items.map((item) => {
    const cost = computeItemCost(
      item.recipe,
      item.loaves,
      input.pantryItems,
      input.markupBps,
      input.sellRoundingCents,
    );
    return {
      id: item.itemId,
      recipeId: item.recipe.recipe.id,
      loaves: item.loaves,
      scaleFactor: item.loaves / item.recipe.recipe.yieldLoaves,
      recipeSnapshot: buildRecipeSnapshot(item.recipe, item.loaves, input.pantryItems),
      costSnapshot: buildCostSnapshot(cost, input.currencyCode, nowIso, input.markupBps),
    };
  });

  // "Start now" records the first step as started at the same instant (screens-bake.md 3.6).
  const firstStarted = forward
    ? plan.steps.find((s) => !s.isAlongside && s.itemId !== null)?.key
    : undefined;

  const steps: BakeStepInput[] = plan.steps.map((step: PlannedStep) => {
    const template = step.itemId
      ? itemsById.get(step.itemId)?.recipe.steps.find((s) => s.id === step.stepId)
      : undefined;
    const started = step.key === firstStarted;
    return {
      bakeItemId: step.itemId,
      stepKey: step.key,
      sourceStepId: step.stepId,
      slotIndex: step.slotIndex,
      name: step.name,
      kind: step.kind,
      isAlongside: step.isAlongside,
      durationMin: step.durationMin,
      durationSource: step.durationSource,
      minMin: step.minMin,
      maxMin: step.maxMin,
      originalPlannedStartAt: toIso(step.startAt),
      plannedStartAt: toIso(step.startAt),
      plannedEndAt: toIso(step.endAt),
      status: started ? 'active' : 'pending',
      actualStartAt: started ? nowIso : null,
      foldCount: template?.folds?.count ?? null,
      foldIntervalMin: template?.folds?.intervalMin ?? null,
      notify: step.notify,
    };
  });

  return {
    bake: {
      status: forward ? 'active' : 'scheduled',
      mode: input.mode,
      requestedReadyAt:
        forward || preview.requestedReadyAt === null ? null : toIso(preview.requestedReadyAt),
      originalReadyAt: toIso(plan.readyAt),
      plannedReadyAt: toIso(plan.readyAt),
      timeZone: input.zone,
      kitchenTempC: validTemp(input.kitchenTempC),
      ovenCapacity: Math.min(12, Math.max(1, Math.round(input.ovenCapacity))),
      reheatGapMin: input.reheatGapMin,
      headsUpMin: input.headsUpMin,
      currencyCode: input.currencyCode,
      ovenSlots: plan.slots.map((slot) => ({
        index: slot.index,
        startAt: toIso(slot.startAt),
        endAt: toIso(slot.endAt),
        loaves: slot.loaves.map((l) => ({ bakeItemId: l.itemId, loaves: l.loaves })),
      })),
      startedAt: forward ? nowIso : null,
    },
    items,
    steps,
  };
}

export interface BakeService extends LiveOps {
  /** Writes the bake, then runs the `onBakeScheduled` side effects. Rejects when the write fails. */
  create(input: CreateBakeInput): Promise<BakeAggregate>;
}

export function createBakeService(
  repos: Repositories,
  onChange: () => void | Promise<void>,
): BakeService {
  return {
    ...createLiveOps(repos, onChange),
    async create(input) {
      let created: BakeAggregate;
      try {
        created = await repos.bakes.create(buildNewBake(input));
      } catch (error) {
        logger.error('schedule.create_failed', error, { items: input.items.length });
        throw error;
      }
      await onChange();
      // The bake exists now; reminders are best effort and never undo it.
      await notifyBakeScheduled(created.bake.id);
      return created;
    },
  };
}
