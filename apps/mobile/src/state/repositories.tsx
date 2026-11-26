/**
 * Hands the opened repositories to hooks. Only hooks and services read this; components never do
 * (architecture section 3). Tests provide fakes through `RepositoriesProvider`.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Repositories } from '../db/repositories';

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({
  repositories,
  children,
}: {
  repositories: Repositories;
  children: ReactNode;
}) {
  return (
    <RepositoriesContext.Provider value={repositories}>{children}</RepositoriesContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos)
    throw new Error('useRepositories must be used inside <RepositoriesProvider> (DB gate).');
  return repos;
}
