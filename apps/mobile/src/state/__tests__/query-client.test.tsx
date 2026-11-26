import { createQueryClient } from '../query-client';
import { qk } from '../query-keys';

describe('createQueryClient (ADR 0002, SEC-01 L7d)', () => {
  const defaults = createQueryClient().getDefaultOptions();

  it('never pauses for the network and never goes stale', () => {
    expect(defaults.queries?.networkMode).toBe('always');
    expect(defaults.mutations?.networkMode).toBe('always');
    expect(defaults.queries?.staleTime).toBe(Infinity);
  });

  it('does not retry or refetch automatically', () => {
    expect(defaults.queries?.retry).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnReconnect).toBe(false);
  });

  it('returns an independent client per call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});

describe('query keys', () => {
  it('nest under the .all prefix so invalidation by prefix works', () => {
    expect(qk.recipes.detail('a').slice(0, 1)).toEqual(qk.recipes.all);
    expect(qk.pantry.list().slice(0, 1)).toEqual(qk.pantry.all);
    expect(qk.bakes.active().slice(0, 1)).toEqual(qk.bakes.all);
  });

  it('distinguish archived-inclusive pantry lists', () => {
    expect(qk.pantry.list()).not.toEqual(qk.pantry.list({ includeArchived: true }));
  });
});
