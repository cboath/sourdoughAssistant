import { useMemo } from 'react';
import { usePantryList } from '../../pantry/hooks/usePantry';
import { useRecipe } from '../../recipes/hooks/useRecipes';
import { useCostSettings } from '../../recipes/hooks/useRecipeData';
import { computeCostView, type CostView } from '../compute';

/** `useRecipeCost(id, loaves)`: recipe detail + pantry (archived included) -> breakdown (architecture section 5). */
export function useRecipeCost(id: string, loavesOverride?: number) {
  const recipe = useRecipe(id);
  const pantry = usePantryList({ includeArchived: true });
  const { markupBps, sellRoundingCents } = useCostSettings();
  const aggregate = recipe.data;
  const view = useMemo<CostView | undefined>(() => {
    if (!aggregate || !pantry.data) return undefined;
    return computeCostView({
      ingredients: aggregate.ingredients,
      pantryItems: pantry.data,
      yieldLoaves: aggregate.recipe.yieldLoaves,
      loaves: loavesOverride ?? aggregate.recipe.yieldLoaves,
      markupBps,
      sellRoundingCents,
    });
  }, [aggregate, pantry.data, loavesOverride, markupBps, sellRoundingCents]);
  return {
    aggregate,
    view,
    pantryItems: pantry.data,
    isPending: recipe.isPending || pantry.isPending,
    isError: recipe.isError || pantry.isError,
    notFound: recipe.data === null,
    refetch: () => Promise.all([recipe.refetch(), pantry.refetch()]),
  };
}
