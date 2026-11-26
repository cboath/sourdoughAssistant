import { createNodeDatabase } from './node';

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

describe('transaction queueing', () => {
  const setup = async () => {
    const db = createNodeDatabase();
    await db.exec('CREATE TABLE t (v TEXT) STRICT');
    return db;
  };

  it('an outer read issued during an open transaction waits for commit and sees its writes', async () => {
    const db = await setup();
    const hold = gate();
    const events: string[] = [];
    const tx = db.transaction(async (inner) => {
      await inner.run("INSERT INTO t VALUES ('in-tx')");
      events.push('inserted');
      await hold.promise;
      events.push('committing');
    });
    await new Promise((r) => setTimeout(r, 10));
    const read = db.all<{ v: string }>('SELECT v FROM t').then((rows) => {
      events.push('outer-read');
      return rows;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(['inserted']); // outer read has not run
    hold.open();
    await tx;
    expect(await read).toEqual([{ v: 'in-tx' }]);
    expect(events).toEqual(['inserted', 'committing', 'outer-read']);
  });

  it('an outer write issued during an open transaction waits, and survives a rollback of the tx', async () => {
    const db = await setup();
    const hold = gate();
    const tx = db
      .transaction(async (inner) => {
        await inner.run("INSERT INTO t VALUES ('rolled-back')");
        await hold.promise;
        throw new Error('abort');
      })
      .catch((e: Error) => e.message);
    await new Promise((r) => setTimeout(r, 10));
    let written = false;
    const write = db.run("INSERT INTO t VALUES ('outer')").then(() => {
      written = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(written).toBe(false);
    hold.open();
    expect(await tx).toBe('abort');
    await write;
    expect(await db.all('SELECT v FROM t')).toEqual([{ v: 'outer' }]);
  });

  it('a second transaction waits for the first', async () => {
    const db = await setup();
    const hold = gate();
    const order: string[] = [];
    const first = db.transaction(async () => {
      await hold.promise;
      order.push('first');
    });
    const second = db.transaction(async () => {
      order.push('second');
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual([]);
    hold.open();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('keeps working after a failed call', async () => {
    const db = await setup();
    await expect(db.run('INSERT INTO nope VALUES (1)')).rejects.toThrow();
    await db.run("INSERT INTO t VALUES ('ok')");
    expect(await db.all('SELECT v FROM t')).toHaveLength(1);
  });
});
