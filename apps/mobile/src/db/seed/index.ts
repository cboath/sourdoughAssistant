/**
 * Idempotent first-run seeding (docs/data-model.md section 5, docs/sync-readiness.md N1).
 *
 * Runs in one transaction. A seed whose `seed_key` already exists, including a tombstoned row, is
 * skipped, so a starter recipe the user deleted is never recreated. `app_meta.seedVersion` records
 * the last catalog version applied; only entries with a newer `sinceVersion` are considered.
 *
 * Every row is written with the id and the timestamp fixed in `data.ts`, so all devices hold
 * identical seed rows, passed to the repositories through `CreateOptions`.
 */
import type { Repositories, RepositorySet } from '../repositories';
import type { StepInput } from '../types';
import {
  SEED_CATALOG,
  SEED_DATE,
  SEED_EPOCH,
  SEED_VERSION,
  type RecipeSeed,
  type SeedCatalog,
} from './data';

export { SEED_CATALOG, SEED_DATE, SEED_EPOCH, SEED_VERSION } from './data';
export type { SeedCatalog, PantrySeed, RecipeSeed } from './data';

export const SEED_VERSION_KEY = 'seedVersion';

export interface SeedOptions {
  /** Defaults to the shipped catalog. Tests pass their own. */
  catalog?: SeedCatalog;
  /** Defaults to `SEED_VERSION`. */
  version?: number;
}

export interface SeedResult {
  /** The version stored before this run (0 when never seeded). */
  previousVersion: number;
  version: number;
  pantryCreated: string[];
  recipesCreated: string[];
}

function toStepInputs(seed: RecipeSeed): StepInput[] {
  const idByKey = new Map(seed.steps.map((step) => [step.key, step.id]));
  return seed.steps.map(({ key, alongsideOf, ...step }) => {
    const anchorId = alongsideOf ? idByKey.get(alongsideOf) : undefined;
    if (alongsideOf && !anchorId) {
      throw new Error(
        `Seed ${seed.seedKey}: step "${key}" anchors to unknown step "${alongsideOf}".`,
      );
    }
    return {
      ...step,
      anchor: anchorId
        ? { type: 'alongside', stepId: anchorId, align: 'endsAtStart', offsetMin: 0 }
        : { type: 'sequential' },
    };
  });
}

async function applySeeds(
  repos: RepositorySet,
  { catalog = SEED_CATALOG, version = SEED_VERSION }: SeedOptions,
): Promise<SeedResult> {
  const stored = Number.parseInt((await repos.meta.get(SEED_VERSION_KEY)) ?? '0', 10);
  const previousVersion = Number.isFinite(stored) ? stored : 0;
  const result: SeedResult = { previousVersion, version, pantryCreated: [], recipesCreated: [] };
  if (previousVersion >= version) return result;

  const pantryIdFor = async (seedKey: string): Promise<string | null> => {
    // Includes archived rows: a recipe line may still point at an archived seed item.
    const found = await repos.pantry.findBySeedKey(seedKey);
    return found?.id ?? null;
  };

  for (const entry of catalog.pantry) {
    if (entry.sinceVersion <= previousVersion || entry.sinceVersion > version) continue;
    if (await repos.pantry.findBySeedKey(entry.seedKey)) continue;
    const priced =
      entry.item.packagePriceCents != null &&
      entry.item.packageSize != null &&
      entry.item.packageUnit != null;
    await repos.pantry.create(
      { ...entry.item, seedKey: entry.seedKey, pricedAt: priced ? SEED_DATE : null },
      { id: entry.id, priceHistoryId: entry.priceHistoryId, at: SEED_EPOCH },
    );
    result.pantryCreated.push(entry.seedKey);
  }

  for (const entry of catalog.recipes) {
    if (entry.sinceVersion <= previousVersion || entry.sinceVersion > version) continue;
    if (await repos.recipes.findBySeedKey(entry.seedKey)) continue;
    const ingredients = [];
    for (const { pantryKey, ...line } of entry.ingredients) {
      ingredients.push({
        ...line,
        pantryItemId: pantryKey ? await pantryIdFor(pantryKey) : null,
      });
    }
    await repos.recipes.create(
      {
        recipe: { ...entry.recipe, seedKey: entry.seedKey },
        ingredients,
        steps: toStepInputs(entry),
      },
      { id: entry.id, at: SEED_EPOCH },
    );
    result.recipesCreated.push(entry.seedKey);
  }

  await repos.meta.set(SEED_VERSION_KEY, String(version));
  return result;
}

/** Seeds the database in a single transaction. Safe to call on every launch. */
export function seedDatabase(repos: Repositories, options: SeedOptions = {}): Promise<SeedResult> {
  return repos.transaction((tx) => applySeeds(tx, options));
}
