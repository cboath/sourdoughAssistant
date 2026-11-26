/**
 * node:sqlite adapter. TESTS ONLY (ADR 0013): nothing in the app bundle may import this file.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlParams } from '../adapter';
import { OPEN_PRAGMAS, createSqlDatabase, type RawConnection } from './shared';

type Statement = ReturnType<DatabaseSync['prepare']>;

function runStatement(stmt: Statement, params: SqlParams | undefined) {
  if (params === undefined) return stmt.run();
  return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
}
function getStatement(stmt: Statement, params: SqlParams | undefined) {
  if (params === undefined) return stmt.get();
  return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
}
function allStatement(stmt: Statement, params: SqlParams | undefined) {
  if (params === undefined) return stmt.all();
  return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
}

/** Opens a node:sqlite database (default in memory) with the same PRAGMAs as on device. */
export function createNodeDatabase(path: string = ':memory:'): SqlDatabase {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(OPEN_PRAGMAS);
  const raw: RawConnection = {
    run: async (sql, params) => {
      const result = runStatement(sqlite.prepare(sql), params);
      return { changes: Number(result.changes) };
    },
    get: async <T>(sql: string, params?: SqlParams) => {
      const row = getStatement(sqlite.prepare(sql), params);
      // node:sqlite returns null-prototype objects; copy so callers get plain objects.
      return row === undefined ? null : ({ ...row } as T);
    },
    all: async <T>(sql: string, params?: SqlParams) =>
      allStatement(sqlite.prepare(sql), params).map((row) => ({ ...row }) as T),
    exec: async (sql) => {
      sqlite.exec(sql);
    },
    close: async () => {
      sqlite.close();
    },
  };
  return createSqlDatabase(raw);
}
