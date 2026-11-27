import { RepositoryError } from '../errors';
import {
  BAKE_FIELDS,
  BAKE_ITEM_FIELDS,
  BAKE_STEP_FIELDS,
  toBake,
  toBakeItem,
  toBakeStep,
  type BakeItemRow,
  type BakeRow,
  type BakeStepRow,
} from '../mappers/bake';
import {
  insertRow,
  softDeleteWhere,
  toColumns,
  updateRow,
  writeChildren,
  type ChildWrite,
} from '../sql';
import type {
  Bake,
  BakeAggregate,
  BakeItem,
  BakeItemPatch,
  BakePatch,
  BakeStatus,
  BakeStep,
  BakeStepInput,
  BakeStepPatch,
  NewBakeAggregate,
  ReadOptions,
} from '../types';
import { getRowById, requireRow, type RepoContext } from './context';

export interface ListBakesOptions {
  /** Only these statuses. Default: all. */
  statuses?: readonly BakeStatus[];
}

export type BakeStepUpdate = BakeStepPatch & { id: string };

/**
 * The bake header and the listed step rows as they were, for undo (architecture 9.1 Q-A2). Only
 * the columns a live event can change are captured.
 */
export interface BakeRowsPreImage {
  bakeId: string;
  bake: Pick<
    Bake,
    'status' | 'plannedReadyAt' | 'ovenSlots' | 'startedAt' | 'completedAt' | 'cancelledAt'
  >;
  steps: Array<BakeStepUpdate>;
}

export function createBakeRepository({ q, atomic, clock, ids }: RepoContext) {
  const readAggregate = async (
    id: string,
    options?: ReadOptions,
  ): Promise<BakeAggregate | null> => {
    const row = await getRowById<BakeRow>(q, 'bake', id, options);
    if (!row) return null;
    const live = options?.includeDeleted ? '' : ' AND deleted_at IS NULL';
    const [items, steps] = await Promise.all([
      q.all<BakeItemRow>(
        `SELECT * FROM bake_item WHERE bake_id = $id${live} ORDER BY position, id`,
        {
          $id: id,
        },
      ),
      q.all<BakeStepRow>(
        `SELECT * FROM bake_step WHERE bake_id = $id${live} ORDER BY position, planned_start_at, id`,
        { $id: id },
      ),
    ]);
    return { bake: toBake(row), items: items.map(toBakeItem), steps: steps.map(toBakeStep) };
  };

  const stepWrite = (input: BakeStepInput, position: number): ChildWrite => ({
    id: input.id ?? ids.newId(),
    columns: toColumns({ ...input, position }, BAKE_STEP_FIELDS),
  });

  return {
    get: readAggregate,

    /** Bake headers ordered by planned ready time (soonest first). */
    async list(options?: ListBakesOptions): Promise<Bake[]> {
      const statuses = options?.statuses ?? [];
      const params: Record<string, string> = {};
      const filter =
        statuses.length > 0
          ? ` AND status IN (${statuses
              .map((status, i) => {
                params[`$s${i}`] = status;
                return `$s${i}`;
              })
              .join(', ')})`
          : '';
      const rows = await q.all<BakeRow>(
        `SELECT * FROM bake WHERE deleted_at IS NULL${filter} ORDER BY planned_ready_at, id`,
        params,
      );
      return rows.map(toBake);
    },

    /**
     * Creates the bake, its items and its materialized step plan in one transaction. Step order
     * is the array order. Give an item an `id` when steps reference it through `bakeItemId`.
     */
    async create(input: NewBakeAggregate): Promise<BakeAggregate> {
      const id = ids.newId();
      const now = clock.nowIso();
      const items: ChildWrite[] = input.items.map((item, index) => ({
        id: item.id ?? ids.newId(),
        columns: toColumns({ ...item, position: index }, BAKE_ITEM_FIELDS),
      }));
      const steps = input.steps.map((step, index) => stepWrite(step, index));
      await atomic(async (tx) => {
        await insertRow(tx, 'bake', {
          ...toColumns(input.bake, BAKE_FIELDS),
          id,
          created_at: now,
          updated_at: now,
        });
        await writeChildren(tx, 'bake_item', 'bake_id', id, items, now);
        await writeChildren(tx, 'bake_step', 'bake_id', id, steps, now);
      });
      return (await readAggregate(id)) as BakeAggregate;
    },

    /** Edits bake-level fields (status, plan, notes, timestamps). */
    async update(id: string, patch: BakePatch): Promise<Bake> {
      const changes = await updateRow(
        q,
        'bake',
        { id, deleted_at: null },
        toColumns(patch, BAKE_FIELDS),
        clock.nowIso(),
      );
      if (changes === 0) throw new RepositoryError('notFound', `Bake ${id} not found.`);
      return toBake(await requireRow<BakeRow>(q, 'bake', id, 'Bake'));
    },

    async updateItem(id: string, patch: BakeItemPatch): Promise<BakeItem> {
      const changes = await updateRow(
        q,
        'bake_item',
        { id, deleted_at: null },
        toColumns(patch, BAKE_ITEM_FIELDS),
        clock.nowIso(),
      );
      if (changes === 0) throw new RepositoryError('notFound', `Bake item ${id} not found.`);
      return toBakeItem(await requireRow<BakeItemRow>(q, 'bake_item', id, 'Bake item'));
    },

    /** Tombstones one item and the steps that belong to it. */
    async removeItem(id: string): Promise<boolean> {
      const now = clock.nowIso();
      return atomic(async (tx) => {
        const changes = await updateRow(
          tx,
          'bake_item',
          { id, deleted_at: null },
          { deleted_at: now },
          now,
        );
        if (changes === 0) return false;
        await softDeleteWhere(tx, 'bake_step', 'bake_item_id', id, now);
        return true;
      });
    },

    /**
     * Applies recompute results: several step rows in one transaction. Fails (and writes nothing)
     * if any id is not a live step of this bake.
     */
    async updateSteps(bakeId: string, updates: readonly BakeStepUpdate[]): Promise<BakeStep[]> {
      const now = clock.nowIso();
      await atomic(async (tx) => {
        for (const { id, ...patch } of updates) {
          const changes = await updateRow(
            tx,
            'bake_step',
            { id, bake_id: bakeId, deleted_at: null },
            toColumns(patch, BAKE_STEP_FIELDS),
            now,
          );
          if (changes === 0) {
            throw new RepositoryError('notFound', `Bake step ${id} not found in bake ${bakeId}.`);
          }
        }
      });
      const aggregate = await readAggregate(bakeId);
      const wanted = new Set(updates.map((u) => u.id));
      return (aggregate?.steps ?? []).filter((s) => wanted.has(s.id));
    },

    /** Appends steps after the current last position. */
    async addSteps(bakeId: string, inputs: readonly BakeStepInput[]): Promise<BakeStep[]> {
      const now = clock.nowIso();
      const created: string[] = [];
      await atomic(async (tx) => {
        await requireRow<BakeRow>(tx, 'bake', bakeId, 'Bake');
        const max = await tx.get<{ p: number | null }>(
          'SELECT MAX(position) AS p FROM bake_step WHERE bake_id = $id',
          { $id: bakeId },
        );
        let position = (max?.p ?? -1) + 1;
        for (const input of inputs) {
          const write = stepWrite(input, position++);
          created.push(write.id);
          await insertRow(tx, 'bake_step', {
            ...write.columns,
            id: write.id,
            bake_id: bakeId,
            created_at: now,
            updated_at: now,
          });
        }
      });
      const aggregate = await readAggregate(bakeId);
      const wanted = new Set(created);
      return (aggregate?.steps ?? []).filter((s) => wanted.has(s.id));
    },

    /**
     * Captures the bake header and the given step rows (live ones only) so `restoreRows` can put
     * them back. Returns null when the bake does not exist.
     */
    async snapshotRows(
      bakeId: string,
      stepIds: readonly string[],
    ): Promise<BakeRowsPreImage | null> {
      const aggregate = await readAggregate(bakeId);
      if (!aggregate) return null;
      const wanted = new Set(stepIds);
      const { bake } = aggregate;
      return {
        bakeId,
        bake: {
          status: bake.status,
          plannedReadyAt: bake.plannedReadyAt,
          ovenSlots: bake.ovenSlots,
          startedAt: bake.startedAt,
          completedAt: bake.completedAt,
          cancelledAt: bake.cancelledAt,
        },
        steps: aggregate.steps
          .filter((s) => wanted.has(s.id))
          .map((s) => ({
            id: s.id,
            durationMin: s.durationMin,
            plannedStartAt: s.plannedStartAt,
            plannedEndAt: s.plannedEndAt,
            actualStartAt: s.actualStartAt,
            actualEndAt: s.actualEndAt,
            status: s.status,
            inferredDone: s.inferredDone,
            foldsDone: s.foldsDone,
            foldTimes: s.foldTimes,
          })),
      };
    },

    /** Writes a `snapshotRows` pre-image back in one transaction. */
    async restoreRows(preImage: BakeRowsPreImage): Promise<void> {
      const now = clock.nowIso();
      await atomic(async (tx) => {
        const changes = await updateRow(
          tx,
          'bake',
          { id: preImage.bakeId, deleted_at: null },
          toColumns(preImage.bake, BAKE_FIELDS),
          now,
        );
        if (changes === 0) {
          throw new RepositoryError('notFound', `Bake ${preImage.bakeId} not found.`);
        }
        for (const { id, ...patch } of preImage.steps) {
          const stepChanges = await updateRow(
            tx,
            'bake_step',
            { id, bake_id: preImage.bakeId, deleted_at: null },
            toColumns(patch, BAKE_STEP_FIELDS),
            now,
          );
          if (stepChanges === 0) {
            throw new RepositoryError('notFound', `Bake step ${id} not found.`);
          }
        }
      });
    },

    /** Tombstones the bake with its items and steps in one transaction. */
    async softDelete(id: string): Promise<boolean> {
      const now = clock.nowIso();
      return atomic(async (tx) => {
        const changes = await updateRow(
          tx,
          'bake',
          { id, deleted_at: null },
          { deleted_at: now },
          now,
        );
        if (changes === 0) return false;
        await softDeleteWhere(tx, 'bake_step', 'bake_id', id, now);
        await softDeleteWhere(tx, 'bake_item', 'bake_id', id, now);
        return true;
      });
    },
  };
}
export type BakeRepository = ReturnType<typeof createBakeRepository>;
