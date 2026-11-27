/** Renders a screen with theme, safe area, a fresh QueryClient and repositories over an in-memory database. */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { createTestDb, type TestDb } from '../../db/test-utils';
import { seedDatabase } from '../../db/seed';
import { createQueryClient } from '../../state/query-client';
import { RepositoriesProvider } from '../../state/repositories';
import { Providers } from '../../ui/testing';

const clients: QueryClient[] = [];

/** Clears every client created by `renderScreen` so gc timers do not keep Jest alive. */
export function clearClients(): void {
  clients.splice(0).forEach((c) => c.clear());
}

export async function renderScreen(
  ui: ReactElement,
  options: { seed?: boolean; db?: TestDb; prepare?: (db: TestDb) => Promise<void> } = {},
) {
  const db = options.db ?? (await createTestDb());
  if (options.seed) await seedDatabase(db.repos);
  if (options.prepare) await options.prepare(db);
  const client = createQueryClient();
  clients.push(client);
  const view = await render(ui, {
    wrapper: ({ children }) => (
      <Providers>
        <QueryClientProvider client={client}>
          <RepositoriesProvider repositories={db.repos}>{children}</RepositoriesProvider>
        </QueryClientProvider>
      </Providers>
    ),
  });
  return { db, client, ...view };
}
