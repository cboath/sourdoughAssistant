import type { RepoContext } from './context';

/** Device-local key/value store (`app_meta`). Not synced, not backed up. */
export function createMetaRepository({ q }: RepoContext) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await q.get<{ value: string }>('SELECT value FROM app_meta WHERE key = $key', {
        $key: key,
      });
      return row?.value ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      await q.run(
        'INSERT INTO app_meta (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        { $key: key, $value: value },
      );
    },
    async delete(key: string): Promise<void> {
      await q.run('DELETE FROM app_meta WHERE key = $key', { $key: key });
    },
  };
}
export type MetaRepository = ReturnType<typeof createMetaRepository>;
