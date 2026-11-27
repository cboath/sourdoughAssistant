/** Shared fixtures for the schedule tests: the seeded country loaf and a fixed New York clock. */
import { localToUtc, type QuietHours } from '@sourdough/core';
import { seedDatabase } from '../../../db/seed';
import { createTestDb, type TestDb } from '../../../db/test-utils';
import type { RecipeAggregate } from '../../../db/types';
import type { PreviewInput, PreviewItem } from '../preview';
import { toStepTemplates } from '../snapshot';

export const COUNTRY = '5eed0003-0000-4000-8000-000000000001';
export const ZONE = 'America/New_York';
export const QUIET: QuietHours = { enabled: true, startMin: 22 * 60, endMin: 6 * 60 };

/** Thu 2026-11-26 09:00 in New York (the PRD example week). */
export const NOW = localToUtc({ date: '2026-11-26', time: '09:00' }, ZONE).at;

export async function seededDb(): Promise<TestDb> {
  const db = await createTestDb();
  await seedDatabase(db.repos);
  return db;
}

export async function recipeById(db: TestDb, id: string): Promise<RecipeAggregate> {
  const aggregate = await db.repos.recipes.get(id);
  if (!aggregate) throw new Error(`seed recipe ${id} missing`);
  return aggregate;
}

export function previewItem(
  aggregate: RecipeAggregate,
  itemId = 'item-a',
  loaves = aggregate.recipe.yieldLoaves,
  overrides: Record<string, number> = {},
): PreviewItem {
  return {
    itemId,
    name: aggregate.recipe.name,
    steps: toStepTemplates(aggregate),
    loaves,
    overrides,
  };
}

export function previewInput(
  items: PreviewItem[],
  extra: Partial<PreviewInput> = {},
): PreviewInput {
  return {
    items,
    mode: 'backward',
    readyLocal: { date: '2026-11-28', time: '10:00' },
    ovenCapacity: 2,
    reheatGapMin: 0,
    kitchenTempC: null,
    quiet: QUIET,
    zone: ZONE,
    now: NOW,
    ...extra,
  };
}
