/** Query key factory (architecture section 5). Every query hook uses these; services invalidate by prefix. */
export interface RecipeFilter {
  /** Applied client-side by `useRecipes` (see there), so it is not part of the cache key. */
  search?: string;
  tag?: string;
  favoritesOnly?: boolean;
}

export interface PantryListOptions {
  includeArchived?: boolean;
}

export const qk = {
  recipes: {
    all: ['recipes'] as const,
    list: () => ['recipes', 'list'] as const,
    detail: (id: string) => ['recipes', 'detail', id] as const,
  },
  pantry: {
    all: ['pantry'] as const,
    list: (options: PantryListOptions = {}) =>
      ['pantry', 'list', { includeArchived: options.includeArchived === true }] as const,
    detail: (id: string) => ['pantry', 'detail', id] as const,
    history: (id: string) => ['pantry', 'history', id] as const,
  },
  bakes: {
    all: ['bakes'] as const,
    active: () => ['bakes', 'active'] as const,
    detail: (id: string) => ['bakes', 'detail', id] as const,
  },
} as const;
