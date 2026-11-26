import { DatabaseTooNewError } from './errors';
import { MIGRATIONS, LATEST_VERSION } from './migrations';
import { getSchemaVersion, migrate } from './migrate';
import { createNodeDatabase } from './adapters/node';
import { createFakeClock, createTestDb } from './test-utils';

describe('migrate', () => {
  it('brings an empty database to the current version', async () => {
    const { db } = await createTestDb({ migrate: false });
    expect(await getSchemaVersion(db)).toBe(0);
    const result = await migrate(db, { clock: createFakeClock() });
    expect(result).toEqual({ fromVersion: 0, toVersion: LATEST_VERSION, applied: [1] });
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    const rows = await db.all<{ version: number; name: string; applied_at: string }>(
      'SELECT * FROM _migrations',
    );
    expect(rows).toEqual([{ version: 1, name: 'init', applied_at: '2026-11-26T12:00:00.000Z' }]);
  });

  it('is a no-op the second time', async () => {
    const { db, clock } = await createTestDb();
    const again = await migrate(db, { clock });
    expect(again).toEqual({ fromVersion: 1, toVersion: 1, applied: [] });
    const count = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM _migrations');
    expect(count?.n).toBe(1);
  });

  it('rolls back a failing migration and leaves the version unchanged', async () => {
    const { db, clock } = await createTestDb();
    const failing = {
      version: 2,
      name: 'broken',
      up: async (tx: Parameters<(typeof MIGRATIONS)[0]['up']>[0]) => {
        await tx.exec('CREATE TABLE half_done (id TEXT) STRICT');
        throw new Error('boom');
      },
    };
    await expect(migrate(db, { clock, migrations: [...MIGRATIONS, failing] })).rejects.toThrow(
      'boom',
    );
    expect(await getSchemaVersion(db)).toBe(1);
    const table = await db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'");
    expect(table).toBeNull();
  });

  it('refuses a database written by a newer app', async () => {
    const { db, clock } = await createTestDb();
    await db.run("INSERT INTO _migrations VALUES (5, 'future', '2030-01-01T00:00:00.000Z')");
    await expect(migrate(db, { clock })).rejects.toBeInstanceOf(DatabaseTooNewError);
  });

  it('rejects a registry that is not contiguous from 1', async () => {
    const db = createNodeDatabase();
    const skipped = [{ version: 2, name: 'x', up: async () => undefined }];
    await expect(migrate(db, { clock: createFakeClock(), migrations: skipped })).rejects.toThrow(
      /contiguous/,
    );
  });

  it('calls beforeMigrate only when existing data has pending migrations', async () => {
    const calls: Array<{ fromVersion: number; toVersion: number }> = [];
    const beforeMigrate = async (info: { fromVersion: number; toVersion: number }) => {
      calls.push(info);
    };
    const db = createNodeDatabase();
    const clock = createFakeClock();
    await migrate(db, { clock, beforeMigrate });
    expect(calls).toEqual([]); // fresh install: nothing to protect

    const second = { version: 2, name: 'more', up: async () => undefined };
    await migrate(db, { clock, beforeMigrate, migrations: [...MIGRATIONS, second] });
    expect(calls).toEqual([{ fromVersion: 1, toVersion: 2 }]);
    await migrate(db, { clock, beforeMigrate, migrations: [...MIGRATIONS, second] });
    expect(calls).toHaveLength(1);
  });

  it('does not migrate when beforeMigrate fails', async () => {
    const db = createNodeDatabase();
    const clock = createFakeClock();
    await migrate(db, { clock });
    const second = { version: 2, name: 'more', up: async () => undefined };
    await expect(
      migrate(db, {
        clock,
        migrations: [...MIGRATIONS, second],
        beforeMigrate: async () => {
          throw new Error('copy failed');
        },
      }),
    ).rejects.toThrow('copy failed');
    expect(await getSchemaVersion(db)).toBe(1);
  });

  it('produces the committed schema', async () => {
    const { db } = await createTestDb();
    const objects = await db.all<{ type: string; name: string; sql: string | null }>(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    );
    expect(
      objects.map((o) => `${o.type} ${o.name}\n${o.sql ?? ''}`).join('\n\n'),
    ).toMatchSnapshot();
  });

  it('enforces foreign keys and rolls transactions back', async () => {
    const { db } = await createTestDb();
    const now = '2026-11-26T12:00:00.000Z';
    await expect(
      db.run(
        `INSERT INTO recipe_ingredient (id, recipe_id, position, name, role, amount_g, created_at, updated_at)
         VALUES ('i', 'missing', 0, 'Flour', 'flour', 1, $n, $n)`,
        { $n: now },
      ),
    ).rejects.toThrow(/FOREIGN KEY/);

    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO app_meta (key, value) VALUES ('k', 'v')");
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await db.get("SELECT * FROM app_meta WHERE key = 'k'")).toBeNull();
  });
});
