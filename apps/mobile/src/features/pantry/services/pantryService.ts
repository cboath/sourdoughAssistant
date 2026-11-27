/**
 * Pantry writes (architecture section 7.1). A thin wrapper over the repository layer that also
 * invalidates `pantry.all` and `recipes.all` after every write (costs depend on both).
 */
import { RepositoryError } from '../../../db/errors';
import type { Repositories } from '../../../db/repositories';
import type {
  NewPantryItem,
  PantryItem,
  PantryItemPatch,
  PriceHistoryEntry,
  Unit,
} from '../../../db/types';

export interface SavePriceInput {
  packagePriceCents: number;
  packageSize: number;
  packageUnit: Unit;
  store: string | null;
  /** Local date `YYYY-MM-DD`. */
  pricedAt: string;
  /** Conversion factors entered alongside the price; written in the same transaction. */
  gramsPerCup?: number | null;
  gramsPerEach?: number | null;
}

export interface PantryService {
  createItem(input: NewPantryItem): Promise<PantryItem>;
  /** Non-price fields only (price is read-only in edit mode). */
  updateItem(id: string, patch: PantryItemPatch): Promise<PantryItem>;
  savePrice(itemId: string, input: SavePriceInput): Promise<PriceHistoryEntry>;
  /** Undo of `savePrice`: removes the new row and re-mirrors the previous price. */
  undoSavePrice(entry: PriceHistoryEntry, previous: PantryItem | null): Promise<void>;
  deletePrice(historyId: string): Promise<void>;
  restorePrice(historyId: string): Promise<void>;
  archive(id: string): Promise<void>;
  unarchive(id: string): Promise<void>;
}

export function createPantryService(
  repos: Repositories,
  onChange: () => void | Promise<void>,
): PantryService {
  const done = async <T>(value: T): Promise<T> => {
    await onChange();
    return value;
  };

  return {
    async createItem(input) {
      return done(await repos.pantry.create(input));
    },

    async updateItem(id, patch) {
      return done(await repos.pantry.update(id, patch));
    },

    async savePrice(itemId, input) {
      const entry = await repos.transaction(async (tx) => {
        const factors: PantryItemPatch = {};
        if (input.gramsPerCup != null) factors.gramsPerCup = input.gramsPerCup;
        if (input.gramsPerEach != null) factors.gramsPerEach = input.gramsPerEach;
        if (Object.keys(factors).length > 0) await tx.pantry.update(itemId, factors);
        return tx.pantry.savePrice({
          pantryItemId: itemId,
          packagePriceCents: input.packagePriceCents,
          packageSize: input.packageSize,
          packageUnit: input.packageUnit,
          store: input.store,
          pricedAt: input.pricedAt,
        });
      });
      return done(entry);
    },

    async undoSavePrice(entry, previous) {
      try {
        await repos.pantry.deletePrice(entry.id);
      } catch (error) {
        // The item had no other price: drop the row and put the item back to unpriced.
        if (!(error instanceof RepositoryError) || error.code !== 'invalid') throw error;
        await repos.transaction(async (tx) => {
          await tx.priceHistory.softDelete(entry.id);
          if (previous && previous.packagePriceCents === null) {
            await tx.pantry.update(entry.pantryItemId, {
              packagePriceCents: null,
              packageSize: null,
              packageUnit: null,
              store: null,
              pricedAt: null,
            });
          }
        });
      }
      await onChange();
    },

    async deletePrice(historyId) {
      await repos.pantry.deletePrice(historyId);
      await onChange();
    },

    async restorePrice(historyId) {
      await repos.pantry.restorePrice(historyId);
      await onChange();
    },

    async archive(id) {
      await repos.pantry.archive(id);
      await onChange();
    },

    async unarchive(id) {
      await repos.pantry.unarchive(id);
      await onChange();
    },
  };
}
