import type { SqlDatabase, SqlExecutor, SqlParams } from '../adapter';

/** A single connection with no transaction logic. Each adapter only has to provide this. */
export interface RawConnection extends SqlExecutor {
  close(): Promise<void>;
}

/** PRAGMAs applied when a connection is opened (docs/data-model.md section 1). */
export const OPEN_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

/**
 * Builds a SqlDatabase over one connection. Every call goes through a promise queue, and a
 * transaction holds the queue until it commits or rolls back. That gives the guarantee the ADR
 * wants from exclusive transactions (no interleaving) while keeping one connection, so
 * `foreign_keys = ON` applies to every write.
 */
export function createSqlDatabase(raw: RawConnection): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };

  return {
    run: (sql: string, params?: SqlParams) => enqueue(() => raw.run(sql, params)),
    get: <T>(sql: string, params?: SqlParams) => enqueue(() => raw.get<T>(sql, params)),
    all: <T>(sql: string, params?: SqlParams) => enqueue(() => raw.all<T>(sql, params)),
    exec: (sql: string) => enqueue(() => raw.exec(sql)),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn(raw);
          await raw.exec('COMMIT');
          return value;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // SQLite may already have rolled back; keep the original error.
          }
          throw error;
        }
      }),
    close: () => enqueue(() => raw.close()),
  };
}
