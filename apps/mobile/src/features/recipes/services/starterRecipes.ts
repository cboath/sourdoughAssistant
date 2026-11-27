/**
 * "Add starter recipes" (architecture 7.1, Q-A6): inserts FRESH copies of the seed recipes (new
 * ids, no `seed_key`). Pantry items are matched by live seed key, then by name; missing ones are
 * created with no seed key. Tombstones are never revived and seed ids are never reused.
 */
import type { Repositories } from '../../../db/repositories';
import { SEED_CATALOG } from '../../../db/seed';
import type { PantryItem } from '../../../db/types';
import { withoutId, type IdFactory } from '../draft';

export async function addStarterRecipes(
  repos: Repositories,
  newId: IdFactory,
): Promise<{ recipes: number }> {
  return repos.transaction(async (tx) => {
    const live = await tx.pantry.list();
    const byName = new Map<string, PantryItem>(live.map((p) => [p.name.toLocaleLowerCase(), p]));
    const cache = new Map<string, string>();

    const pantryIdFor = async (seedKey: string): Promise<string | null> => {
      const cached = cache.get(seedKey);
      if (cached) return cached;
      const seed = SEED_CATALOG.pantry.find((p) => p.seedKey === seedKey);
      if (!seed) return null;
      const bySeed = await tx.pantry.findBySeedKey(seedKey);
      let item: PantryItem | null = bySeed && bySeed.deletedAt === null ? bySeed : null;
      item ??= byName.get(seed.item.name.toLocaleLowerCase()) ?? null;
      item ??= await tx.pantry.create({ ...seed.item, seedKey: null });
      cache.set(seedKey, item.id);
      return item.id;
    };

    let count = 0;
    for (const seed of SEED_CATALOG.recipes) {
      const stepIds = new Map(seed.steps.map((s) => [s.key, newId()]));
      const ingredients = [];
      for (const { pantryKey, ...seedLine } of seed.ingredients) {
        const line = withoutId(seedLine);
        ingredients.push({
          ...line,
          id: newId(),
          pantryItemId: pantryKey ? await pantryIdFor(pantryKey) : null,
        });
      }
      const steps = seed.steps.map(({ key, alongsideOf, ...seedStep }) => ({
        ...withoutId(seedStep),
        id: stepIds.get(key) as string,
        anchor: alongsideOf
          ? {
              type: 'alongside' as const,
              stepId: stepIds.get(alongsideOf) as string,
              align: 'endsAtStart' as const,
              offsetMin: 0,
            }
          : { type: 'sequential' as const },
      }));
      await tx.recipes.create({
        recipe: { ...seed.recipe, seedKey: null },
        ingredients,
        steps,
      });
      count += 1;
    }
    return { recipes: count };
  });
}
