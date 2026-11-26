/** Feature-local query keys, all under `qk.pantry.all` so a pantry write invalidates them. */
import { qk } from '../../state/query-keys';

export const pantryKeys = {
  usedIn: (id: string) => [...qk.pantry.all, 'usedIn', id] as const,
};
