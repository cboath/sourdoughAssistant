import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useMemo } from 'react';
import { doughTotals } from '@sourdough/core';
import type { PantryItem, RecipeAggregate } from '../../../db/types';
import { qk } from '../../../state/query-keys';
import { useRepositories } from '../../../state/repositories';
import { useSettings } from '../../../state/settings';
import { usePantryList } from '../../pantry/hooks/usePantry';
import { recipeKeys } from '../keys';
import { costFor, indexPantry, spanMinutes, toLines } from '../metrics';
import { createRecipeService, type RecipeService } from '../services/recipeService';
import { addStarterRecipes } from '../services/starterRecipes';

/** All live recipes with their lines and steps (v1 volumes are small). */
export function useRecipeAggregates() {
  const { recipes } = useRepositories();
  return useQuery<RecipeAggregate[]>({
    queryKey: recipeKeys.summaries(),
    queryFn: async () => {
      const headers = await recipes.list();
      const all = await Promise.all(headers.map((h) => recipes.get(h.id)));
      return all.filter((a): a is RecipeAggregate => a !== null);
    },
  });
}

export interface RecipeSummary {
  id: string;
  name: string;
  tags: string[];
  favorite: boolean;
  yieldLoaves: number;
  stepCount: number;
  /** Total water / total flour as numbers; flour 0 means "No flour yet". */
  totalFlourG: number;
  totalWaterG: number;
  perLoafCents: number;
  costComplete: boolean;
  lineCount: number;
}

export function buildSummaries(
  aggregates: readonly RecipeAggregate[],
  pantryItems: readonly PantryItem[],
): RecipeSummary[] {
  const pantryById = indexPantry(pantryItems);
  return aggregates.map(({ recipe, ingredients, steps }) => {
    const lines = toLines(ingredients);
    const totals = doughTotals(lines);
    const cost = costFor(lines, ingredients, pantryById, recipe.yieldLoaves);
    return {
      id: recipe.id,
      name: recipe.name,
      tags: recipe.tags,
      favorite: recipe.favorite,
      yieldLoaves: recipe.yieldLoaves,
      stepCount: steps.length,
      totalFlourG: totals.totalFlourG,
      totalWaterG: totals.totalWaterG,
      perLoafCents: cost.perLoafCents,
      costComplete: cost.complete && lines.length > 0,
      lineCount: lines.length,
    };
  });
}

/** Rows for the recipe list: aggregates + pantry (archived items still price), computed in a memo. */
export function useRecipeSummaries() {
  const aggregates = useRecipeAggregates();
  const pantry = usePantryList({ includeArchived: true });
  const data = useMemo(
    () =>
      aggregates.data && pantry.data ? buildSummaries(aggregates.data, pantry.data) : undefined,
    [aggregates.data, pantry.data],
  );
  return {
    data,
    isPending: aggregates.isPending || pantry.isPending,
    isError: aggregates.isError || pantry.isError,
    refetch: () => Promise.all([aggregates.refetch(), pantry.refetch()]),
  };
}

export function useRecipeService(): RecipeService {
  const repos = useRepositories();
  const client = useQueryClient();
  return useMemo(
    () => createRecipeService(repos, () => client.invalidateQueries({ queryKey: qk.recipes.all })),
    [repos, client],
  );
}

/** "Add starter recipes": fresh copies, then refresh recipes and pantry. */
export function useAddStarterRecipes() {
  const repos = useRepositories();
  const client = useQueryClient();
  return useMemo(
    () => async () => {
      const result = await addStarterRecipes(repos, randomUUID);
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.recipes.all }),
        client.invalidateQueries({ queryKey: qk.pantry.all }),
      ]);
      return result;
    },
    [repos, client],
  );
}

export { spanMinutes };

/** Markup and rounding from settings, with the provisional defaults when not loaded (tests). */
export function useCostSettings() {
  const settings = useSettings((s) => s.settings);
  return {
    markupBps: settings?.markupBps ?? 20000,
    sellRoundingCents: settings?.sellRoundingCents ?? 0,
  };
}
