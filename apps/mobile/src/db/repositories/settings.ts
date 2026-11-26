import type { CreateOptions } from '../deps';
import { RepositoryError } from '../errors';
import { SETTINGS_FIELDS, toSettings, type SettingsRow } from '../mappers/settings';
import { insertRow, toColumns, updateRow } from '../sql';
import type { ReadOptions, Settings, SettingsPatch } from '../types';
import { getRowById, type RepoContext } from './context';

const ID = 'settings';

/** The single settings row (`id = 'settings'`). */
export function createSettingsRepository({ q, atomic, clock }: RepoContext) {
  const read = async (options?: ReadOptions): Promise<Settings | null> => {
    const row = await getRowById<SettingsRow>(q, 'settings', ID, options);
    return row ? toSettings(row) : null;
  };

  return {
    get: read,

    /**
     * Returns the settings, creating the row with `initial` over the schema defaults when missing.
     * A tombstoned row is revived with its values kept.
     */
    async ensure(initial?: SettingsPatch, options?: CreateOptions): Promise<Settings> {
      return atomic(async (tx) => {
        const row = await getRowById<SettingsRow>(tx, 'settings', ID, { includeDeleted: true });
        const now = options?.at ?? clock.nowIso();
        if (!row) {
          await insertRow(tx, 'settings', {
            ...toColumns(initial ?? {}, SETTINGS_FIELDS),
            id: ID,
            created_at: now,
            updated_at: now,
          });
        } else if (row.deleted_at !== null) {
          await updateRow(tx, 'settings', { id: ID }, { deleted_at: null }, now);
        }
        const fresh = await getRowById<SettingsRow>(tx, 'settings', ID);
        return toSettings(fresh as SettingsRow);
      });
    },

    async update(patch: SettingsPatch): Promise<Settings> {
      const changes = await updateRow(
        q,
        'settings',
        { id: ID, deleted_at: null },
        toColumns(patch, SETTINGS_FIELDS),
        clock.nowIso(),
      );
      if (changes === 0) throw new RepositoryError('notFound', 'Settings row not found.');
      return (await read()) as Settings;
    },

    /** Tombstones the row (a later `ensure` revives it). */
    async softDelete(): Promise<boolean> {
      const now = clock.nowIso();
      const changes = await updateRow(
        q,
        'settings',
        { id: ID, deleted_at: null },
        { deleted_at: now },
        now,
      );
      return changes > 0;
    },
  };
}
export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
