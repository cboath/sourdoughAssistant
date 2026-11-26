import type { SqlDatabase } from './adapter';
import type { Clock } from './deps';
import { DatabaseTooNewError } from './errors';
import { MIGRATIONS } from './migrations';
import type { Migration } from './migrations/types';

export interface MigrateOptions {
  clock: Clock;
  /** Defaults to the bundled registry. Tests pass their own. */
  migrations?: readonly Migration[];
  /**
   * Called once before the first pending migration, only when the database already has a schema
   * version (so there is data to protect). Used for the pre-migration file copy (ADR 0003).
   * If it throws, no migration runs.
   */
  beforeMigrate?: (info: { fromVersion: number; toVersion: number }) => Promise<void>;
}

export interface MigrateResult {
  fromVersion: number;
  toVersion: number;
  applied: number[];
}

const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS _migrations (
  version     INTEGER PRIMARY KEY NOT NULL,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL
) STRICT;
`;

function assertContiguous(migrations: readonly Migration[]): void {
  migrations.forEach((m, index) => {
    if (m.version !== index + 1) {
      throw new Error(
        `Migrations must be contiguous from 1: expected version ${index + 1} at index ${index}, got ${m.version} (${m.name}).`,
      );
    }
  });
}

/** Current schema version, or 0 for an empty database. */
export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  await db.exec(BOOTSTRAP);
  const row = await db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM _migrations');
  return row?.v ?? 0;
}

/**
 * Forward-only migration runner. Each pending migration runs in its own transaction together with
 * its `_migrations` row, so a failure leaves the version unchanged. Re-running is a no-op.
 * Throws DatabaseTooNewError when the database is ahead of the bundled migrations.
 */
export async function migrate(db: SqlDatabase, options: MigrateOptions): Promise<MigrateResult> {
  const migrations = options.migrations ?? MIGRATIONS;
  assertContiguous(migrations);
  const latest = migrations.length;

  const fromVersion = await getSchemaVersion(db);
  if (fromVersion > latest) throw new DatabaseTooNewError(fromVersion, latest);

  const pending = migrations.filter((m) => m.version > fromVersion);
  if (pending.length === 0) return { fromVersion, toVersion: fromVersion, applied: [] };

  if (fromVersion > 0 && options.beforeMigrate) {
    await options.beforeMigrate({ fromVersion, toVersion: latest });
  }

  const applied: number[] = [];
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run('INSERT INTO _migrations (version, name, applied_at) VALUES ($v, $n, $at)', {
        $v: migration.version,
        $n: migration.name,
        $at: options.clock.nowIso(),
      });
    });
    applied.push(migration.version);
  }
  return { fromVersion, toVersion: latest, applied };
}
