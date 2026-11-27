import type { SqlDatabase, SqlExecutor } from '../adapter';
import { systemZone, type RepositoryDeps } from '../deps';
import { createBakeRepository } from './bakes';
import type { RepoContext } from './context';
import { createMetaRepository } from './meta';
import { createPantryRepository, createPriceHistoryRepository } from './pantry';
import { createRecipeRepository } from './recipes';
import { createSettingsRepository } from './settings';

export interface RepositorySet {
  settings: ReturnType<typeof createSettingsRepository>;
  pantry: ReturnType<typeof createPantryRepository>;
  priceHistory: ReturnType<typeof createPriceHistoryRepository>;
  recipes: ReturnType<typeof createRecipeRepository>;
  bakes: ReturnType<typeof createBakeRepository>;
  meta: ReturnType<typeof createMetaRepository>;
}

export interface Repositories extends RepositorySet {
  /**
   * Runs `fn` in one transaction with repositories bound to it. Services use this when a write
   * spans several aggregates (for example, a bake plus a settings change).
   */
  transaction<T>(fn: (repos: RepositorySet) => Promise<T>): Promise<T>;
}

function build(ctx: RepoContext): RepositorySet {
  return {
    settings: createSettingsRepository(ctx),
    pantry: createPantryRepository(ctx),
    priceHistory: createPriceHistoryRepository(ctx),
    recipes: createRecipeRepository(ctx),
    bakes: createBakeRepository(ctx),
    meta: createMetaRepository(ctx),
  };
}

export function createRepositories(deps: RepositoryDeps & { db: SqlDatabase }): Repositories {
  const { db, clock, ids } = deps;
  const zone = deps.zone ?? systemZone;
  return {
    ...build({ q: db, atomic: (fn) => db.transaction(fn), clock, ids, zone }),
    transaction: (fn) =>
      db.transaction((tx: SqlExecutor) =>
        fn(build({ q: tx, atomic: (inner) => inner(tx), clock, ids, zone })),
      ),
  };
}

export type { BakeRepository, BakeRowsPreImage, ListBakesOptions, BakeStepUpdate } from './bakes';
export type { ListPantryOptions, PantryRepository, PriceHistoryRepository } from './pantry';
export type { RecipeRepository } from './recipes';
export type { SettingsRepository } from './settings';
export type { MetaRepository } from './meta';
