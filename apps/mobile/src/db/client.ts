/**
 * App-side database entry point: opens `sourdough.db` with expo-sqlite, runs PRAGMAs and
 * migrations, and exposes one shared handle. Not imported by tests (they use test-utils).
 */
import * as SQLite from 'expo-sqlite';
import type { SqlDatabase } from './adapter';
import { createExpoDatabase } from './adapters/expo';
import { systemClock, systemZone } from './deps';
import { expoIds } from './ids';
import { MIGRATIONS } from './migrations';
import { migrate } from './migrate';
import { createRepositories, type Repositories } from './repositories';
import { runDbSelfTest, type SelfTestResult } from './selfTest';

export const DB_FILE = 'sourdough.db';
const BACKUP_DIR_NAME = 'backups';

/**
 * Copies the live database to `backups/pre-migration-v<from>.db` and removes older copies, so only
 * the last one is kept (ADR 0003). Uses the SQLite backup API, which is safe in WAL mode.
 */
async function copyBeforeMigration(source: SQLite.SQLiteDatabase, fromVersion: number) {
  const directory = `${SQLite.defaultDatabaseDirectory}/${BACKUP_DIR_NAME}`;
  for (let v = 1; v <= MIGRATIONS.length; v += 1) {
    try {
      await SQLite.deleteDatabaseAsync(`pre-migration-v${v}.db`, directory);
    } catch {
      // Nothing to delete for this version.
    }
  }
  const destination = await SQLite.openDatabaseAsync(
    `pre-migration-v${fromVersion}.db`,
    undefined,
    directory,
  );
  try {
    await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
  } finally {
    await destination.closeAsync();
  }
}

async function openAndMigrate(): Promise<SqlDatabase> {
  const native = await SQLite.openDatabaseAsync(DB_FILE);
  const db = await createExpoDatabase(native);
  try {
    // Throws DatabaseTooNewError when the file is from a newer app version; the caller shows the
    // "please update" screen.
    await migrate(db, {
      clock: systemClock,
      beforeMigrate: ({ fromVersion }) => copyBeforeMigration(native, fromVersion),
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  return db;
}

let opening: Promise<SqlDatabase> | null = null;

/** The shared, migrated database. A failed open is not cached, so a retry can succeed. */
export function getDb(): Promise<SqlDatabase> {
  if (!opening) {
    opening = openAndMigrate().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

export async function getRepositories(): Promise<Repositories> {
  return createRepositories({
    db: await getDb(),
    clock: systemClock,
    ids: expoIds,
    zone: systemZone,
  });
}

/** Dev-only: runs the migration and round-trip smoke test on the device's SQLite (ADR 0013). */
export async function runDeviceDbSelfTest(): Promise<SelfTestResult> {
  if (!__DEV__) throw new Error('The database self-test is only available in development builds.');
  const native = await SQLite.openDatabaseAsync(':memory:');
  const db = await createExpoDatabase(native);
  try {
    return await runDbSelfTest(db, { ids: expoIds });
  } finally {
    await db.close();
  }
}
