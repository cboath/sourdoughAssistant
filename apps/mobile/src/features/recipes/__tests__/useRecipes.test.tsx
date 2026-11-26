import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Repositories } from '../../../db/repositories';
import type { Recipe } from '../../../db/types';
import { createQueryClient } from '../../../state/query-client';
import { RepositoriesProvider } from '../../../state/repositories';
import { filterRecipes, useRecipe, useRecipes } from '../hooks/useRecipes';

const recipe = (name: string, over: Partial<Recipe> = {}): Recipe => ({
  id: name,
  name,
  notes: '',
  yieldLoaves: 1,
  doughWeightG: null,
  tags: [],
  favorite: false,
  seedKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const RECIPES = [
  recipe('Country loaf', { favorite: true, tags: ['everyday'] }),
  recipe('Rye', { tags: ['rye'] }),
];

// Clients created by tests are cleared afterwards so gc timers do not keep Jest alive.
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
});

function setup(repos: unknown, client: QueryClient = createQueryClient()) {
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RepositoriesProvider repositories={repos as Repositories}>{children}</RepositoriesProvider>
    </QueryClientProvider>
  );
  return wrapper;
}

describe('filterRecipes', () => {
  it('filters by search (case-insensitive), tag and favorites', () => {
    expect(filterRecipes(RECIPES, { search: 'RYE' }).map((r) => r.name)).toEqual(['Rye']);
    expect(filterRecipes(RECIPES, { tag: 'everyday' }).map((r) => r.name)).toEqual([
      'Country loaf',
    ]);
    expect(filterRecipes(RECIPES, { favoritesOnly: true }).map((r) => r.name)).toEqual([
      'Country loaf',
    ]);
    expect(filterRecipes(RECIPES, {})).toHaveLength(2);
  });
});

describe('useRecipes', () => {
  it('loads through the repository and filters without refetching', async () => {
    const list = jest.fn().mockResolvedValue(RECIPES);
    const client = createQueryClient();
    const wrapper = setup({ recipes: { list } }, client);
    const { result, rerender } = await renderHook(
      ({ search }: { search: string }) => useRecipes({ search }),
      { wrapper, initialProps: { search: '' } },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    await rerender({ search: 'rye' });
    await waitFor(() => expect(result.current.data?.map((r) => r.name)).toEqual(['Rye']));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('surfaces repository errors without retrying', async () => {
    const list = jest.fn().mockRejectedValue(new Error('db'));
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: setup({ recipes: { list } }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('useRecipe', () => {
  it('returns null for an unknown id so the screen can show not-found', async () => {
    const get = jest.fn().mockResolvedValue(null);
    const { result } = await renderHook(() => useRecipe('missing'), {
      wrapper: setup({ recipes: { get } }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(get).toHaveBeenCalledWith('missing');
  });
});
