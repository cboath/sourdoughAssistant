import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlDatabase, SqlParams } from '../adapter';
import { OPEN_PRAGMAS, createSqlDatabase } from './shared';

/**
 * Wraps an opened expo-sqlite database. Runs the open PRAGMAs, then serializes all access through
 * one connection (see createSqlDatabase for why this replaces withExclusiveTransactionAsync).
 */
export async function createExpoDatabase(db: SQLiteDatabase): Promise<SqlDatabase> {
  await db.execAsync(OPEN_PRAGMAS);
  return createSqlDatabase({
    run: async (sql: string, params?: SqlParams) => {
      const result = await db.runAsync(sql, params ?? []);
      return { changes: result.changes };
    },
    get: <T>(sql: string, params?: SqlParams) => db.getFirstAsync<T>(sql, params ?? []),
    all: <T>(sql: string, params?: SqlParams) => db.getAllAsync<T>(sql, params ?? []),
    exec: (sql: string) => db.execAsync(sql),
    close: () => db.closeAsync(),
  });
}
