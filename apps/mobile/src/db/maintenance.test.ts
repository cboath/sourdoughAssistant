import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeDatabase } from './adapters/node';
import { checkpointWal, vacuumInto } from './maintenance';
import { migrate } from './migrate';
import { createFakeClock } from './test-utils';

describe('maintenance', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sourdough-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('checkpoints the WAL so the main file holds recent writes', async () => {
    const db = createNodeDatabase(join(dir, 'a.db'));
    await migrate(db, { clock: createFakeClock() });
    await db.run("INSERT INTO app_meta (key, value) VALUES ('k', 'v')");
    const result = await checkpointWal(db);
    expect(result.busy).toBe(0);
    await db.close();

    const copy = createNodeDatabase(join(dir, 'a.db'));
    expect(await copy.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'k'")).toEqual(
      {
        value: 'v',
      },
    );
    await copy.close();
  });

  it('writes a self-contained copy with VACUUM INTO', async () => {
    const db = createNodeDatabase(join(dir, 'b.db'));
    await migrate(db, { clock: createFakeClock() });
    await db.run("INSERT INTO app_meta (key, value) VALUES ('k', 'v')");
    const target = join(dir, 'copy.db');
    await vacuumInto(db, target);
    expect(existsSync(`${target}-wal`)).toBe(false);

    const copy = createNodeDatabase(target);
    expect(await copy.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'k'")).toEqual(
      {
        value: 'v',
      },
    );
    await copy.close();
    await db.close();
  });
});
