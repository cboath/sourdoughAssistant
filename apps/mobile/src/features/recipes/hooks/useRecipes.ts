/**
 * Example query hooks over repositories: the pattern for RN-05 and later.
 * 1. The key comes from `qk`.
 * 2. `queryFn` calls a repository through `useRepositories()`.
 * 3. View-only filtering happens in `select` (no refetch per keystroke).
 * 4. Writes live in services, which invalidate `qk.recipes.all`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Recipe, RecipeAggregate } from '../../../db/types';
import { useRepositories } from '../../../state/repositories';
import { qk, type RecipeFilter } from '../../../state/query-keys';

export function filterRecipes(recipes: readonly Recipe[], filter: RecipeFilter): Recipe[] {
  const needle = filter.search?.trim().toLocaleLowerCase();
  return recipes.filter((recipe) => {
    if (filter.favoritesOnly && !recipe.favorite) return false;
    if (filter.tag && !recipe.tags.includes(filter.tag)) return false;
    if (needle && !recipe.name.toLocaleLowerCase().includes(needle)) return false;
    return true;
  });
}

export function useRecipes(filter: RecipeFilter = {}) {
  const { recipes } = useRepositories();
  const { search, tag, favoritesOnly } = filter;
  // A stable select reference lets TanStack Query skip re-running it when nothing changed.
  const select = useMemo(
    () => (all: Recipe[]) => filterRecipes(all, { search, tag, favoritesOnly }),
    [search, tag, favoritesOnly],
  );
  return useQuery({ queryKey: qk.recipes.list(), queryFn: () => recipes.list(), select });
}

/** `data === null` means "no such recipe" (the screen shows not-found); undefined means loading. */
export function useRecipe(id: string) {
  const { recipes } = useRepositories();
  return useQuery<RecipeAggregate | null>({
    queryKey: qk.recipes.detail(id),
    queryFn: () => recipes.get(id),
  });
}
