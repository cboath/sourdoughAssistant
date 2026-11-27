/** Feature-local query keys, all under `qk.bakes.all` so a bake write invalidates them. */
import { qk } from '../../state/query-keys';

export const scheduleKeys = {
  /** Bake headers, newest first (smart default ready time). */
  headers: () => [...qk.bakes.all, 'headers'] as const,
  /** Recipe ids of the most recent bakes (picker "Recent"). */
  recentRecipes: () => [...qk.bakes.all, 'recentRecipes'] as const,
};
