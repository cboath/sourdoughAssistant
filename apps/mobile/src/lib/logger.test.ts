import { logger } from './logger';

describe('logger (SEC-01 L6)', () => {
  beforeEach(() => logger.clear());

  it('records the event and numeric/boolean fields', () => {
    logger.info('db.open', { ms: 12, migrated: true, skipped: null });
    expect(logger.entries()).toMatchObject([
      { level: 'info', event: 'db.open', fields: { ms: 12, migrated: true, skipped: null } },
    ]);
  });

  it('drops fields whose key suggests user content, and any string value', () => {
    logger.info('x', {
      recipeName: 1,
      notes: 2,
      fileUri: 3,
      sqlParams: 4,
      count: 5,
      sneaky: 'Country loaf' as unknown as number,
    });
    expect(logger.entries()[0]?.fields).toEqual({ count: 5 });
  });

  it('never records an error message, only its class name and a safe code', () => {
    const error = Object.assign(new Error('INSERT INTO recipe VALUES ("Grandma\'s rye")'), {
      name: 'DbError',
      code: 'notFound',
    });
    logger.error('db.write_failed', error);
    const entry = logger.entries()[0]!;
    expect(entry).toMatchObject({ errorName: 'DbError', errorCode: 'notFound' });
    expect(JSON.stringify(entry)).not.toContain('Grandma');
    expect(JSON.stringify(entry)).not.toContain('INSERT');
  });

  it('ignores a code that is not a short identifier', () => {
    logger.error('x', Object.assign(new Error('m'), { code: 'Recipe "Rye" not found' }));
    expect(logger.entries()[0]?.errorCode).toBeUndefined();
  });

  it('replaces events that are not short identifiers (no interpolated user text)', () => {
    logger.info('Opened recipe: Country loaf');
    expect(logger.entries()[0]?.event).toBe('invalid_event');
  });

  it('keeps a bounded ring buffer', () => {
    for (let i = 0; i < 600; i += 1) logger.debug('tick', { i });
    const entries = logger.entries();
    expect(entries).toHaveLength(500);
    expect(entries[0]?.fields).toEqual({ i: 100 });
  });

  it('never records money-like fields (ADR 0015: prices are not logged)', () => {
    logger.info('cost.checked', {
      priceCents: 240,
      costCents: 139,
      amount: 5,
      markupBps: 20000,
      sellPrice: 417,
      money: 1,
      cents: 2,
      kept: 7,
    });
    expect(logger.entries()[0]?.fields).toEqual({ kept: 7 });
  });

  it('does not write to the console outside development builds', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    logger.info('quiet');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
