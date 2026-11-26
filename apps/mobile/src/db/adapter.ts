/**
 * Storage abstraction (ADR 0003, ADR 0013). Repositories depend only on these interfaces, so the
 * same SQL runs on expo-sqlite (device) and node:sqlite (Jest).
 *
 * Named parameters include the `$` prefix in the key: `{ $id: 'x' }` binds `$id`.
 */
export type SqlValue = string | number | null;
export type SqlParams = Record<string, SqlValue> | SqlValue[];

export interface SqlExecutor {
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  get<T>(sql: string, params?: SqlParams): Promise<T | null>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  /** Runs one or more statements without parameters (DDL, PRAGMA). */
  exec(sql: string): Promise<void>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `fn` in one write transaction (BEGIN IMMEDIATE ... COMMIT, ROLLBACK on throw).
   * Transactions and top-level calls are serialized, so unrelated queries never interleave.
   * Inside `fn`, use the `tx` argument only: calling the outer database would wait for the
   * transaction to finish and deadlock.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
