/**
 * Live bake writes (architecture 9.1): apply a recompute event, undo it, finish, cancel and
 * sweep. They sit on `bakeService` next to `create`. Every change is one transaction, and only
 * the latest event can be undone (the token holds the pre-image and the bake's `updated_at`
 * after the write; any later write makes it stale).
 */
import {
  fromIso,
  recomputePlan,
  toIso,
  type EpochMs,
  type IanaZone,
  type QuietHours,
  type RecomputeEvent,
  type RecomputeResult,
} from '@sourdough/core';
import type { BakeRowsPreImage, Repositories } from '../../../db/repositories';
import type { BakePatch, BakeStatus } from '../../../db/types';
import { logger } from '../../../lib/logger';
import { rowUpdates, toBakePlan } from '../plan';
import { notifyBakeProgressChanged } from '../sideEffects';

/** Active or scheduled bakes whose ready time is this long past are completed by `sweep` (Q-A10). */
export const STALE_AFTER_MS = 12 * 3_600_000;

export type LiveErrorCode =
  | 'notFound'
  | 'notActive'
  | 'unknownStep'
  | 'alreadyDone'
  | 'invalidFoldIndex'
  | 'notAFoldStep'
  | 'timeInFuture'
  | 'beforeStart'
  | 'beforePrevious';

export interface LiveError {
  code: LiveErrorCode;
  /** For `beforeStart` and `beforePrevious`: the earliest allowed instant. */
  minAt?: EpochMs;
}

export type LiveResult<T> = { ok: true; value: T } | { ok: false; error: LiveError };
const fail = (code: LiveErrorCode, minAt?: EpochMs): { ok: false; error: LiveError } => ({
  ok: false,
  error: { code, ...(minAt === undefined ? {} : { minAt }) },
});

/** In memory only; the UI drops it after the snackbar's 8 s. */
export interface RevertToken {
  bakeId: string;
  preImage: BakeRowsPreImage;
  /** The bake's `updated_at` right after the change. */
  postUpdatedAt: string;
}

export interface ApplyEventContext {
  now: EpochMs;
  quiet?: QuietHours;
  zone?: IanaZone;
  /** Also complete the bake (the final step's "Done, finish bake"). */
  finish?: boolean;
}

export interface ApplyEventValue {
  revertToken: RevertToken;
  /** The recomputed plan (warnings included), for the snackbar text. */
  result: RecomputeResult;
}

export interface LiveOps {
  applyEvent(
    bakeId: string,
    event: RecomputeEvent,
    ctx: ApplyEventContext,
  ): Promise<LiveResult<ApplyEventValue>>;
  revert(token: RevertToken): Promise<{ ok: true } | { ok: false; reason: 'stale' }>;
  /** Completes the bake. Undoable like an event. */
  finish(bakeId: string, now: EpochMs): Promise<LiveResult<{ revertToken: RevertToken }>>;
  /** Cancels the bake. Not undoable. */
  cancel(bakeId: string, now: EpochMs): Promise<LiveResult<null>>;
  /** Activates bakes whose first step is due and completes stale ones. Returns the changed ids. */
  sweep(now: EpochMs): Promise<string[]>;
}

const OPEN: readonly BakeStatus[] = ['scheduled', 'active'];

export function createLiveOps(repos: Repositories, onChange: () => void | Promise<void>): LiveOps {
  const token = async (bakeId: string, preImage: BakeRowsPreImage): Promise<RevertToken> => {
    const after = await repos.bakes.get(bakeId);
    return { bakeId, preImage, postUpdatedAt: after?.bake.updatedAt ?? '' };
  };

  return {
    async applyEvent(bakeId, event, ctx) {
      const aggregate = await repos.bakes.get(bakeId);
      if (!aggregate) return fail('notFound');
      if (!OPEN.includes(aggregate.bake.status)) return fail('notActive');
      const { plan, progress, rows } = toBakePlan(aggregate);
      const row = rows.get(event.key);
      if (!row) return fail('unknownStep');

      // Bounds live here, not in core (Q-A3): core accepts any `at`.
      if (event.type === 'stepDone' || event.type === 'stepStarted' || event.type === 'foldDone') {
        if (event.at > ctx.now) return fail('timeInFuture');
      }
      if (event.type === 'stepDone') {
        const lower = row.actualStartAt
          ? fromIso(row.actualStartAt)
          : fromIso(row.plannedStartAt) <= ctx.now
            ? fromIso(row.plannedStartAt)
            : null;
        if (lower !== null && event.at < lower) return fail('beforeStart', lower);
      }
      if (event.type === 'stepStarted' && row.bakeItemId && !row.isAlongside) {
        const previousEnds = aggregate.steps
          .filter(
            (s) =>
              s.bakeItemId === row.bakeItemId &&
              !s.isAlongside &&
              s.status === 'done' &&
              !s.inferredDone &&
              s.actualEndAt !== null,
          )
          .map((s) => fromIso(s.actualEndAt as string));
        const floor = previousEnds.length > 0 ? Math.max(...previousEnds) : null;
        if (floor !== null && event.at < floor) return fail('beforePrevious', floor);
      }

      const recomputed = recomputePlan(plan, progress, event, {
        now: ctx.now,
        ...(ctx.quiet ? { quiet: ctx.quiet } : {}),
        ...(ctx.zone ? { zone: ctx.zone } : {}),
      });
      if (!recomputed.ok) return fail(recomputed.error.code);
      const result = recomputed.value;

      const updates = rowUpdates(rows, result);
      const patch: BakePatch = {
        plannedReadyAt: toIso(result.plan.readyAt),
        ovenSlots: result.plan.slots.map((slot) => ({
          index: slot.index,
          startAt: toIso(slot.startAt),
          endAt: toIso(slot.endAt),
          loaves: slot.loaves.map((l) => ({ bakeItemId: l.itemId, loaves: l.loaves })),
        })),
      };
      const sequential = row.bakeItemId !== null && !row.isAlongside;
      if (sequential && event.type !== 'extend' && aggregate.bake.status === 'scheduled') {
        patch.status = 'active';
        patch.startedAt = aggregate.bake.startedAt ?? toIso(Math.min(event.at, ctx.now));
      }
      if (ctx.finish) {
        patch.status = 'completed';
        patch.completedAt = toIso(ctx.now);
      }

      const preImage = await repos.bakes.snapshotRows(
        bakeId,
        updates.map((u) => u.id),
      );
      if (!preImage) return fail('notFound');
      try {
        await repos.transaction(async (tx) => {
          if (updates.length > 0) await tx.bakes.updateSteps(bakeId, updates);
          await tx.bakes.update(bakeId, patch);
        });
      } catch (error) {
        logger.error('live.apply_failed', error, { steps: updates.length });
        throw error;
      }
      const revertToken = await token(bakeId, preImage);
      await onChange();
      await notifyBakeProgressChanged(bakeId, 'event');
      return { ok: true, value: { revertToken, result } };
    },

    async revert(revertToken) {
      const current = await repos.bakes.get(revertToken.bakeId);
      if (!current || current.bake.updatedAt !== revertToken.postUpdatedAt) {
        return { ok: false, reason: 'stale' };
      }
      await repos.bakes.restoreRows(revertToken.preImage);
      await onChange();
      await notifyBakeProgressChanged(revertToken.bakeId, 'revert');
      return { ok: true };
    },

    async finish(bakeId, now) {
      const aggregate = await repos.bakes.get(bakeId);
      if (!aggregate) return fail('notFound');
      if (!OPEN.includes(aggregate.bake.status)) return fail('notActive');
      const preImage = await repos.bakes.snapshotRows(bakeId, []);
      if (!preImage) return fail('notFound');
      await repos.bakes.update(bakeId, { status: 'completed', completedAt: toIso(now) });
      const revertToken = await token(bakeId, preImage);
      await onChange();
      await notifyBakeProgressChanged(bakeId, 'finish');
      return { ok: true, value: { revertToken } };
    },

    async cancel(bakeId, now) {
      const aggregate = await repos.bakes.get(bakeId);
      if (!aggregate) return fail('notFound');
      if (!OPEN.includes(aggregate.bake.status)) return fail('notActive');
      await repos.bakes.update(bakeId, { status: 'cancelled', cancelledAt: toIso(now) });
      await onChange();
      await notifyBakeProgressChanged(bakeId, 'cancel');
      return { ok: true, value: null };
    },

    async sweep(now) {
      const open = await repos.bakes.list({ statuses: OPEN });
      const changed: string[] = [];
      for (const header of open) {
        if (fromIso(header.plannedReadyAt) < now - STALE_AFTER_MS) {
          // Step rows stay as they are: nothing was marked, and nothing is invented.
          await repos.bakes.update(header.id, {
            status: 'completed',
            completedAt: header.plannedReadyAt,
          });
          changed.push(header.id);
        } else if (header.status === 'scheduled') {
          const aggregate = await repos.bakes.get(header.id);
          const first = aggregate?.steps.reduce(
            (m, s) => Math.min(m, fromIso(s.plannedStartAt)),
            Number.POSITIVE_INFINITY,
          );
          if (first !== undefined && Number.isFinite(first) && now >= first) {
            await repos.bakes.update(header.id, { status: 'active', startedAt: toIso(first) });
            changed.push(header.id);
          }
        }
      }
      if (changed.length > 0) {
        await onChange();
        for (const id of changed) await notifyBakeProgressChanged(id, 'sweep');
      }
      return changed;
    },
  };
}
