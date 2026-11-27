/** Fixtures for the live tests: a real bake from the seeded country loaf, written like RN-06 does. */
import { fromIso, localToUtc, type EpochMs } from '@sourdough/core';
import type { TestDb } from '../../../db/test-utils';
import type { BakeAggregate } from '../../../db/types';
import { buildPreview } from '../../schedule/preview';
import {
  buildNewBake,
  createBakeService,
  type CreateBakeInput,
} from '../../schedule/services/bakeService';
import {
  COUNTRY,
  NOW,
  ZONE,
  previewInput,
  previewItem,
  recipeById,
} from '../../schedule/__tests__/helpers';

export { COUNTRY, NOW, QUIET, ZONE, seededDb } from '../../schedule/__tests__/helpers';

export const WHOLE_WHEAT = '5eed0003-0000-4000-8000-000000000002';
export const MIN = 60_000;

/** Local wall-clock time in New York as an instant. */
export const at = (date: string, time: string): EpochMs => localToUtc({ date, time }, ZONE).at;

export interface MakeBakeOptions {
  recipes?: Array<{ id: string; loaves?: number }>;
  mode?: 'backward' | 'forward';
  ready?: { date: string; time: string };
  ovenCapacity?: number;
  now?: EpochMs;
  /** Slider values by step name prefix, in minutes (applies to the first recipe). */
  durations?: Record<string, number>;
  /** Makes item ids unique across several bakes of the same recipe in one database. */
  itemTag?: string;
  /** Headsup lead in minutes (default 15). */
  headsUpMin?: number;
  /**
   * Write through the real `create` (repository write, then the `onBakeScheduled` seam) instead of
   * the repository directly, so reminders are planned the way the app does it.
   */
  service?: { create(input: CreateBakeInput): Promise<BakeAggregate> };
}

/** Writes a bake straight through the repository (the way `bakeService.create` does). */
export async function makeBake(db: TestDb, options: MakeBakeOptions = {}): Promise<BakeAggregate> {
  const recipes = options.recipes ?? [{ id: COUNTRY }];
  const aggregates = await Promise.all(recipes.map((r) => recipeById(db, r.id)));
  const items = aggregates.map((aggregate, index) => {
    const overrides: Record<string, number> = {};
    if (index === 0) {
      for (const [prefix, minutes] of Object.entries(options.durations ?? {})) {
        const step = aggregate.steps.find((s) => s.name.startsWith(prefix));
        if (step) overrides[step.id] = minutes;
      }
    }
    return previewItem(
      aggregate,
      `item-${options.itemTag ? `${options.itemTag}-` : ''}${index}-${aggregate.recipe.id.slice(-2)}`,
      recipes[index]?.loaves,
      overrides,
    );
  });
  const mode = options.mode ?? 'backward';
  const now = options.now ?? NOW;
  const preview = buildPreview(
    previewInput(items, {
      mode,
      readyLocal:
        mode === 'forward' ? null : (options.ready ?? { date: '2026-11-28', time: '10:00' }),
      ovenCapacity: options.ovenCapacity ?? 1,
      now,
    }),
  );
  const input: CreateBakeInput = {
    preview,
    mode,
    items: items.map((item, index) => ({
      itemId: item.itemId,
      recipe: aggregates[index]!,
      loaves: item.loaves,
    })),
    kitchenTempC: null,
    ovenCapacity: options.ovenCapacity ?? 1,
    reheatGapMin: 0,
    headsUpMin: options.headsUpMin ?? 15,
    currencyCode: 'USD',
    markupBps: 20000,
    sellRoundingCents: 0,
    pantryItems: [],
    zone: ZONE,
    now,
  };
  if (options.service) return options.service.create(input);
  return db.repos.bakes.create(buildNewBake(input));
}

export const stepByName = (aggregate: BakeAggregate, name: string, itemIndex = 0) => {
  const item = aggregate.items[itemIndex];
  const step = aggregate.steps.find((s) => s.name === name && s.bakeItemId === item?.id);
  if (!step) throw new Error(`step "${name}" missing`);
  return step;
};

/**
 * Brings a bake to the moment a step starts: `stepStarted` at the step's planned start marks every
 * step before it done (inferred) without shifting anything. Returns the refreshed bake.
 */
export async function startAt(
  db: TestDb,
  bake: BakeAggregate,
  name: string,
  itemIndex = 0,
): Promise<BakeAggregate> {
  const service = createBakeService(db.repos, () => undefined);
  const row = stepByName(bake, name, itemIndex);
  const when = fromIso(row.plannedStartAt);
  const result = await service.applyEvent(
    bake.bake.id,
    { type: 'stepStarted', key: row.stepKey, at: when },
    { now: when },
  );
  if (!result.ok) throw new Error(`could not start ${name}: ${result.error.code}`);
  return (await db.repos.bakes.get(bake.bake.id))!;
}

/** The bake's step planned start/end as epoch ms. */
export const plannedStart = (bake: BakeAggregate, name: string, itemIndex = 0) =>
  fromIso(stepByName(bake, name, itemIndex).plannedStartAt);
export const plannedEnd = (bake: BakeAggregate, name: string, itemIndex = 0) =>
  fromIso(stepByName(bake, name, itemIndex).plannedEndAt);
