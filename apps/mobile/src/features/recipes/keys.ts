import { qk } from '../../state/query-keys';

/** Feature-local keys, under `qk.recipes.all` so any recipe or pantry write invalidates them. */
export const recipeKeys = {
  summaries: () => [...qk.recipes.all, 'summaries'] as const,
};
