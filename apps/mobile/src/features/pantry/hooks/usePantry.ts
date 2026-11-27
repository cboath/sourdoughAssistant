import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { PantryItem, PriceHistoryEntry, RecipeIngredient } from '../../../db/types';
import { qk, type PantryListOptions } from '../../../state/query-keys';
import { useRepositories } from '../../../state/repositories';
import { pantryKeys } from '../keys';
import { createPantryService, type PantryService } from '../services/pantryService';

/** Non-archived items by default; costing passes `includeArchived: true`. */
export function usePantryList(options: PantryListOptions = {}) {
  const { pantry } = useRepositories();
  return useQuery<PantryItem[]>({
    queryKey: qk.pantry.list(options),
    queryFn: () => pantry.list({ includeArchived: options.includeArchived === true }),
  });
}

/** `data === null`: no such live item (archived while open, or a bad id). */
export function usePantryItem(id: string) {
  const { pantry } = useRepositories();
  return useQuery<PantryItem | null>({
    queryKey: qk.pantry.detail(id),
    queryFn: () => pantry.get(id),
  });
}

/** Newest first; the first row is the current price. */
export function usePriceHistory(id: string) {
  const { priceHistory } = useRepositories();
  return useQuery<PriceHistoryEntry[]>({
    queryKey: qk.pantry.history(id),
    queryFn: () => priceHistory.listForItem(id),
  });
}

export interface UsedInEntry {
  recipeId: string;
  recipeName: string;
  lines: Array<Pick<RecipeIngredient, 'id' | 'role' | 'amountG'>>;
}

/** Live recipes using the item, with the line amounts and roles ("450 g · Flour"). */
export function useUsedIn(id: string) {
  const { pantry, recipes } = useRepositories();
  return useQuery<UsedInEntry[]>({
    queryKey: pantryKeys.usedIn(id),
    queryFn: async () => {
      const used = await pantry.usedIn(id);
      const aggregates = await Promise.all(used.map((u) => recipes.get(u.recipeId)));
      return used.flatMap((u, i) => {
        const aggregate = aggregates[i];
        if (!aggregate) return [];
        const lines = aggregate.ingredients
          .filter((line) => line.pantryItemId === id)
          .map(({ id: lineId, role, amountG }) => ({ id: lineId, role, amountG }));
        return [{ recipeId: u.recipeId, recipeName: u.name, lines }];
      });
    },
  });
}

/** The pantry service bound to the repositories, invalidating pantry and recipe queries. */
export function usePantryService(): PantryService {
  const repos = useRepositories();
  const client = useQueryClient();
  return useMemo(
    () =>
      createPantryService(repos, async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: qk.pantry.all }),
          client.invalidateQueries({ queryKey: qk.recipes.all }),
        ]);
      }),
    [repos, client],
  );
}
