import type { SqlDatabase } from './adapter';

export interface CheckpointResult {
  /** 0 when the checkpoint completed; 1 when a reader blocked it. */
  busy: number;
  walFrames: number;
  checkpointedFrames: number;
}

/**
 * Flushes the WAL into the main `.db` file and truncates the `-wal` file. Call this before
 * sharing the raw database file, otherwise recent writes live only in the `-wal` file, which is
 * not shared (threat model L4c). Check `busy === 0` before sharing.
 */
export async function checkpointWal(db: SqlDatabase): Promise<CheckpointResult> {
  const row = await db.get<{ busy: number; log: number; checkpointed: number }>(
    'PRAGMA wal_checkpoint(TRUNCATE)',
  );
  return {
    busy: row?.busy ?? 0,
    walFrames: row?.log ?? 0,
    checkpointedFrames: row?.checkpointed ?? 0,
  };
}

/**
 * Writes a consistent, compacted, self-contained copy of the database to `destinationPath` using
 * `VACUUM INTO`. Preferred for sharing: the live file is untouched and the copy has no `-wal`.
 * The destination must not exist yet and must be a plain filesystem path (no `file:` URI).
 * The caller deletes the copy after sharing.
 */
export async function vacuumInto(db: SqlDatabase, destinationPath: string): Promise<void> {
  await db.run('VACUUM INTO $path', { $path: destinationPath });
}
