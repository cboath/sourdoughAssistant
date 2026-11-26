/** Test helpers. Imports node:sqlite, so never import this from app code. */
import type { SqlDatabase } from './adapter';
import { createNodeDatabase } from './adapters/node';
import { createZone, type Clock, type Ids, type Zone } from './deps';
import { migrate } from './migrate';
import type { Migration } from './migrations/types';
import { createRepositories, type Repositories } from './repositories';

export interface FakeClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createFakeClock(startIso = '2026-11-26T12:00:00.000Z'): FakeClock {
  let current = new Date(startIso).getTime();
  return {
    nowIso: () => new Date(current).toISOString(),
    set: (iso) => {
      current = new Date(iso).getTime();
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

/** Deterministic, valid-looking UUID v4 values: 00000000-0000-4000-8000-000000000001, ... */
export function createSequentialIds(): Ids {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    },
  };
}

export interface TestDb {
  db: SqlDatabase;
  clock: FakeClock;
  ids: Ids;
  zone: Zone;
  repos: Repositories;
}

/** A fresh in-memory database per call (ADR 0013). */
export async function createTestDb(
  options: {
    migrate?: boolean;
    clock?: FakeClock;
    migrations?: readonly Migration[];
    timeZone?: string;
  } = {},
): Promise<TestDb> {
  const db = createNodeDatabase(':memory:');
  const clock = options.clock ?? createFakeClock();
  const ids = createSequentialIds();
  const zone = createZone(options.timeZone ?? 'UTC');
  if (options.migrate !== false) {
    await migrate(db, { clock, migrations: options.migrations });
  }
  return { db, clock, ids, zone, repos: createRepositories({ db, clock, ids, zone }) };
}
