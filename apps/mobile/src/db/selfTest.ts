import type { SqlDatabase } from './adapter';
import { systemClock, systemZone, type Clock, type Ids } from './deps';
import { LATEST_VERSION } from './migrations';
import { migrate } from './migrate';
import { createRepositories } from './repositories';

export interface SelfTestResult {
  ok: boolean;
  schemaVersion: number;
  /** Human-readable failures; empty when ok. */
  failures: string[];
}

/**
 * Smoke test for the migration runner and a repository round trip on whatever engine backs `db`.
 * Run on device behind `__DEV__` (see client.ts) to catch SQLite version differences from the
 * Node engine used in Jest (ADR 0013). `db` must be a fresh, empty database.
 */
export async function runDbSelfTest(
  db: SqlDatabase,
  deps: { clock?: Clock; ids: Ids },
): Promise<SelfTestResult> {
  const clock = deps.clock ?? systemClock;
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };

  const first = await migrate(db, { clock });
  check(first.toVersion === LATEST_VERSION, 'migration did not reach the latest version');
  const second = await migrate(db, { clock });
  check(second.applied.length === 0, 'second migration run was not a no-op');

  const repos = createRepositories({ db, clock, ids: deps.ids, zone: systemZone });
  const item = await repos.pantry.create({
    name: 'Self-test flour',
    packagePriceCents: 499,
    packageSize: 5,
    packageUnit: 'lb',
  });
  const recipe = await repos.recipes.create({
    recipe: { name: 'Self-test loaf', tags: ['test'] },
    ingredients: [
      { name: 'Flour', role: 'flour', amountG: 500, pantryItemId: item.id },
      { name: 'Levain', role: 'levain', amountG: 100, levainHydrationPct: 100 },
    ],
    steps: [
      {
        name: 'Bulk',
        kind: 'bulk',
        durationMin: 360,
        minMin: 300,
        maxMin: 480,
        tempSensitive: true,
        anchor: { type: 'sequential' },
        folds: null,
        notify: true,
      },
    ],
  });
  const reloaded = await repos.recipes.get(recipe.recipe.id);
  check(reloaded?.ingredients.length === 2, 'recipe ingredients did not round-trip');
  check(reloaded?.steps[0]?.tempSensitive === true, 'step boolean did not round-trip');
  check((await repos.priceHistory.listForItem(item.id)).length === 1, 'price history missing');
  await repos.recipes.softDelete(recipe.recipe.id);
  check((await repos.recipes.get(recipe.recipe.id)) === null, 'soft delete did not hide recipe');

  return { ok: failures.length === 0, schemaVersion: first.toVersion, failures };
}
