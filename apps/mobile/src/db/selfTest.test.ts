import { createNodeDatabase } from './adapters/node';
import { runDbSelfTest } from './selfTest';
import { createSequentialIds } from './test-utils';

it('self-test passes on a fresh database', async () => {
  const result = await runDbSelfTest(createNodeDatabase(), { ids: createSequentialIds() });
  expect(result).toEqual({ ok: true, schemaVersion: 1, failures: [] });
});
