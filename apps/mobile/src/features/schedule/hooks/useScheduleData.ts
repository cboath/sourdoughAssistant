import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Bake } from '../../../db/types';
import { qk } from '../../../state/query-keys';
import { useRepositories } from '../../../state/repositories';
import { scheduleKeys } from '../keys';
import { createBakeService, type BakeService } from '../services/bakeService';

export function useBakeService(): BakeService {
  const repos = useRepositories();
  const client = useQueryClient();
  return useMemo(
    () => createBakeService(repos, () => client.invalidateQueries({ queryKey: qk.bakes.all })),
    [repos, client],
  );
}

/** All live bake headers, for the smart default ready time. */
export function useBakeHeaders() {
  const { bakes } = useRepositories();
  return useQuery<Bake[]>({ queryKey: scheduleKeys.headers(), queryFn: () => bakes.list() });
}

/** Recipe ids of the three most recently created bakes, newest first (picker "Recent"). */
export function useRecentRecipeIds() {
  const { bakes } = useRepositories();
  return useQuery<string[]>({
    queryKey: scheduleKeys.recentRecipes(),
    queryFn: async () => {
      const headers = await bakes.list();
      const recent = [...headers]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3);
      const aggregates = await Promise.all(recent.map((h) => bakes.get(h.id)));
      const ids: string[] = [];
      for (const aggregate of aggregates) {
        for (const item of aggregate?.items ?? []) {
          if (item.recipeId && !ids.includes(item.recipeId)) ids.push(item.recipeId);
        }
      }
      return ids;
    },
  });
}
