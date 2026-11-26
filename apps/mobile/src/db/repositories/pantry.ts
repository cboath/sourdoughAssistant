import type { CreateOptions } from '../deps';
import { RepositoryError } from '../errors';
import {
  PANTRY_FIELDS,
  PRICE_HISTORY_FIELDS,
  toPantryItem,
  toPriceHistory,
  type PantryItemRow,
  type PriceHistoryRow,
} from '../mappers/pantry';
import { insertRow, toColumns, updateRow } from '../sql';
import type {
  NewPantryItem,
  NewPriceHistoryEntry,
  PantryItem,
  PantryItemPatch,
  PriceHistoryEntry,
  ReadOptions,
} from '../types';
import { getRowById, requireRow, type RepoContext } from './context';

export interface ListPantryOptions {
  /** Include archived (soft-deleted) items. Default false. */
  includeArchived?: boolean;
}

export function createPantryRepository(ctx: RepoContext) {
  const { q, atomic, clock, ids, zone } = ctx;

  const logPriceWithId = async (
    tx: typeof q,
    id: string,
    entry: NewPriceHistoryEntry,
    now: string,
  ): Promise<string> => {
    await insertRow(tx, 'price_history', {
      ...toColumns(entry, PRICE_HISTORY_FIELDS),
      id,
      created_at: now,
      updated_at: now,
    });
    return id;
  };
  const logPrice = (tx: typeof q, entry: NewPriceHistoryEntry, now: string, id?: string) =>
    logPriceWithId(tx, id ?? ids.newId(), entry, now);

  const mirrorPrice = async (
    tx: typeof q,
    price: Omit<NewPriceHistoryEntry, 'pantryItemId'> & { pantryItemId: string },
    now: string,
  ): Promise<void> => {
    await updateRow(
      tx,
      'pantry_item',
      { id: price.pantryItemId },
      {
        package_price_cents: price.packagePriceCents,
        package_size: price.packageSize,
        package_unit: price.packageUnit,
        store: price.store ?? null,
        priced_at: price.pricedAt,
      },
      now,
    );
  };

  /** Copies the latest live entry (priced_at DESC, created_at DESC) onto the item. */
  const remirrorLatest = async (tx: typeof q, itemId: string, now: string): Promise<void> => {
    const latest = await tx.get<PriceHistoryRow>(
      `SELECT * FROM price_history WHERE pantry_item_id = $id AND deleted_at IS NULL
        ORDER BY priced_at DESC, created_at DESC, id DESC LIMIT 1`,
      { $id: itemId },
    );
    if (!latest) return;
    await mirrorPrice(tx, toPriceHistory(latest), now);
  };

  const read = async (id: string, options?: ReadOptions): Promise<PantryItem | null> => {
    const row = await getRowById<PantryItemRow>(q, 'pantry_item', id, options);
    return row ? toPantryItem(row) : null;
  };

  return {
    get: read,

    /** A seed key lookup that includes archived rows, so a deleted seed is never recreated. */
    async findBySeedKey(seedKey: string): Promise<PantryItem | null> {
      const row = await q.get<PantryItemRow>('SELECT * FROM pantry_item WHERE seed_key = $k', {
        $k: seedKey,
      });
      return row ? toPantryItem(row) : null;
    },

    async list(options?: ListPantryOptions): Promise<PantryItem[]> {
      const where = options?.includeArchived ? '' : 'WHERE deleted_at IS NULL';
      const rows = await q.all<PantryItemRow>(
        `SELECT * FROM pantry_item ${where} ORDER BY name COLLATE NOCASE, id`,
      );
      return rows.map(toPantryItem);
    },

    /** Creates an item. A priced item also gets its first price-history entry. */
    async create(input: NewPantryItem, options?: CreateOptions): Promise<PantryItem> {
      const id = options?.id ?? ids.newId();
      const now = options?.at ?? clock.nowIso();
      const priced =
        input.packagePriceCents != null && input.packageSize != null && input.packageUnit != null;
      const pricedAt = input.pricedAt ?? (priced ? zone.localDate(now) : null);
      await atomic(async (tx) => {
        await insertRow(tx, 'pantry_item', {
          ...toColumns({ ...input, pricedAt }, PANTRY_FIELDS),
          id,
          created_at: now,
          updated_at: now,
        });
        if (priced && pricedAt) {
          await logPrice(
            tx,
            {
              pantryItemId: id,
              packagePriceCents: input.packagePriceCents as number,
              packageSize: input.packageSize as number,
              packageUnit: input.packageUnit as NonNullable<NewPantryItem['packageUnit']>,
              store: input.store ?? null,
              pricedAt,
            },
            now,
            options?.priceHistoryId,
          );
        }
      });
      return (await read(id)) as PantryItem;
    },

    /**
     * Edits an item. When the package price, size or unit changes to a priced state, a
     * price-history entry is appended in the same transaction (current price stays mirrored).
     */
    async update(id: string, patch: PantryItemPatch): Promise<PantryItem> {
      const now = clock.nowIso();
      await atomic(async (tx) => {
        const current = toPantryItem(
          await requireRow<PantryItemRow>(tx, 'pantry_item', id, 'Pantry item'),
        );
        const priceTouched =
          patch.packagePriceCents !== undefined ||
          patch.packageSize !== undefined ||
          patch.packageUnit !== undefined;
        const next = {
          packagePriceCents:
            patch.packagePriceCents !== undefined
              ? patch.packagePriceCents
              : current.packagePriceCents,
          packageSize: patch.packageSize !== undefined ? patch.packageSize : current.packageSize,
          packageUnit: patch.packageUnit !== undefined ? patch.packageUnit : current.packageUnit,
          store: patch.store !== undefined ? patch.store : current.store,
        };
        const priceChanged =
          priceTouched &&
          (next.packagePriceCents !== current.packagePriceCents ||
            next.packageSize !== current.packageSize ||
            next.packageUnit !== current.packageUnit);
        const logIt =
          priceChanged &&
          next.packagePriceCents !== null &&
          next.packageSize !== null &&
          next.packageUnit !== null;
        const pricedAt =
          patch.pricedAt !== undefined ? patch.pricedAt : logIt ? zone.localDate(now) : undefined;

        await updateRow(
          tx,
          'pantry_item',
          { id },
          toColumns({ ...patch, pricedAt }, PANTRY_FIELDS),
          now,
        );
        if (logIt) {
          await logPrice(
            tx,
            {
              pantryItemId: id,
              packagePriceCents: next.packagePriceCents as number,
              packageSize: next.packageSize as number,
              packageUnit: next.packageUnit as NonNullable<PantryItem['packageUnit']>,
              store: next.store,
              pricedAt: (pricedAt ?? zone.localDate(now)) as string,
            },
            now,
          );
        }
      });
      return (await read(id)) as PantryItem;
    },

    /** Archives the item. Recipe lines keep pointing at it (ADR 0004). */
    async archive(id: string): Promise<boolean> {
      const now = clock.nowIso();
      const changes = await updateRow(
        q,
        'pantry_item',
        { id, deleted_at: null },
        { deleted_at: now },
        now,
      );
      return changes > 0;
    },

    /** Undo of `archive` (the 8 s undo). Clears the tombstone and bumps `updated_at`. */
    async unarchive(id: string): Promise<PantryItem> {
      const changes = await updateRow(
        q,
        'pantry_item',
        { id },
        { deleted_at: null },
        clock.nowIso(),
      );
      if (changes === 0) throw new RepositoryError('notFound', `Pantry item ${id} not found.`);
      return (await read(id)) as PantryItem;
    },

    /** Items by id, in the given order. Archived items are skipped unless `includeArchived`. */
    async getByIds(ids_: readonly string[], options?: ListPantryOptions): Promise<PantryItem[]> {
      if (ids_.length === 0) return [];
      const params: Record<string, string> = {};
      const placeholders = ids_.map((id, i) => {
        params[`$i${i}`] = id;
        return `$i${i}`;
      });
      const live = options?.includeArchived ? '' : ' AND deleted_at IS NULL';
      const rows = await q.all<PantryItemRow>(
        `SELECT * FROM pantry_item WHERE id IN (${placeholders.join(', ')})${live}`,
        params,
      );
      const byId = new Map(rows.map((r) => [r.id, toPantryItem(r)]));
      return ids_.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    },

    /**
     * "Used in": live recipes with a live ingredient line pointing at the item, whether or not
     * the item is archived. Ordered by name.
     */
    async usedIn(id: string): Promise<Array<{ recipeId: string; name: string }>> {
      const rows = await q.all<{ recipe_id: string; name: string }>(
        `SELECT DISTINCT r.id AS recipe_id, r.name AS name
           FROM recipe_ingredient ri JOIN recipe r ON r.id = ri.recipe_id
          WHERE ri.pantry_item_id = $id AND ri.deleted_at IS NULL AND r.deleted_at IS NULL
          ORDER BY r.name COLLATE NOCASE, r.id`,
        { $id: id },
      );
      return rows.map((r) => ({ recipeId: r.recipe_id, name: r.name }));
    },

    /**
     * Appends a price-history entry and, in the same transaction, mirrors it to the item only
     * if `pricedAt` is on or after the item's current `priced_at` (same date: the newer entry
     * wins). Backdated entries are logged but leave the current price alone.
     */
    async savePrice(entry: NewPriceHistoryEntry): Promise<PriceHistoryEntry> {
      const now = clock.nowIso();
      const historyId = ids.newId();
      await atomic(async (tx) => {
        const item = await requireRow<PantryItemRow>(
          tx,
          'pantry_item',
          entry.pantryItemId,
          'Pantry item',
        );
        await logPriceWithId(tx, historyId, entry, now);
        if (item.priced_at === null || entry.pricedAt >= item.priced_at) {
          await mirrorPrice(tx, entry, now);
        }
      });
      return await q
        .get<PriceHistoryRow>('SELECT * FROM price_history WHERE id = $id', {
          $id: historyId,
        })
        .then((r) => toPriceHistory(r as PriceHistoryRow));
    },

    /**
     * Soft-deletes a history entry and re-mirrors the latest remaining entry onto the item.
     * Refuses (RepositoryError 'invalid') when it is the item's last live entry.
     */
    async deletePrice(historyId: string): Promise<void> {
      const now = clock.nowIso();
      await atomic(async (tx) => {
        const row = await requireRow<PriceHistoryRow>(
          tx,
          'price_history',
          historyId,
          'Price entry',
        );
        const live = await tx.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM price_history WHERE pantry_item_id = $id AND deleted_at IS NULL',
          { $id: row.pantry_item_id },
        );
        if ((live?.n ?? 0) <= 1) {
          throw new RepositoryError('invalid', 'Cannot delete the last price entry.');
        }
        await updateRow(tx, 'price_history', { id: historyId }, { deleted_at: now }, now);
        await remirrorLatest(tx, row.pantry_item_id, now);
      });
    },

    /** Undo of `deletePrice`: clears the tombstone and re-mirrors the latest entry. */
    async restorePrice(historyId: string): Promise<void> {
      const now = clock.nowIso();
      await atomic(async (tx) => {
        const row = await getRowById<PriceHistoryRow>(tx, 'price_history', historyId, {
          includeDeleted: true,
        });
        if (!row) throw new RepositoryError('notFound', `Price entry ${historyId} not found.`);
        await updateRow(tx, 'price_history', { id: historyId }, { deleted_at: null }, now);
        await remirrorLatest(tx, row.pantry_item_id, now);
      });
    },
  };
}
export type PantryRepository = ReturnType<typeof createPantryRepository>;

export function createPriceHistoryRepository({ q, atomic, clock, ids }: RepoContext) {
  const read = async (id: string, options?: ReadOptions): Promise<PriceHistoryEntry | null> => {
    const row = await getRowById<PriceHistoryRow>(q, 'price_history', id, options);
    return row ? toPriceHistory(row) : null;
  };
  return {
    get: read,

    /** Appends a log entry without touching the pantry item (use `pantry.update` to change the price). */
    async add(entry: NewPriceHistoryEntry): Promise<PriceHistoryEntry> {
      const id = ids.newId();
      const now = clock.nowIso();
      await atomic(async (tx) => {
        await requireRow<PantryItemRow>(tx, 'pantry_item', entry.pantryItemId, 'Pantry item');
        await insertRow(tx, 'price_history', {
          ...toColumns(entry, PRICE_HISTORY_FIELDS),
          id,
          created_at: now,
          updated_at: now,
        });
      });
      return (await read(id)) as PriceHistoryEntry;
    },

    /** Newest first. */
    async listForItem(pantryItemId: string, options?: ReadOptions): Promise<PriceHistoryEntry[]> {
      const live = options?.includeDeleted ? '' : ' AND deleted_at IS NULL';
      const rows = await q.all<PriceHistoryRow>(
        `SELECT * FROM price_history WHERE pantry_item_id = $id${live} ORDER BY priced_at DESC, created_at DESC, id DESC`,
        { $id: pantryItemId },
      );
      return rows.map(toPriceHistory);
    },

    async softDelete(id: string): Promise<boolean> {
      const now = clock.nowIso();
      const changes = await updateRow(
        q,
        'price_history',
        { id, deleted_at: null },
        { deleted_at: now },
        now,
      );
      return changes > 0;
    },
  };
}
export type PriceHistoryRepository = ReturnType<typeof createPriceHistoryRepository>;
