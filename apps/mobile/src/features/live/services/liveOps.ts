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

/** Fixed order: logs record an index into this list instead of a string (SEC-M45-08). */
export const LIVE_ERROR_CODES: readonly LiveErrorCode[] = [
  'notFound',
  'notActive',
  'unknownStep',
  'alreadyDone',
  'invalidFoldIndex',
  'notAFoldStep',
  'timeInFuture',
  'beforeStart',
  'beforePrevious',
];

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

// One sweep at a time for the whole app: both screens run it on mount and on foreground.
let sweeping: Promise<string[]> | null = null;

/**
 * Every operation reads, checks and writes inside one `repos.transaction` (the adapter runs
 * transactions one at a time), and every status change is a compare-and-set on the status, so a
 * finish, cancel or sweep that lands in between can't be overwritten (SEC-M45-02).
 */
export function createLiveOps(repos: Repositories, onChange: () => void | Promise<void>): LiveOps {
  return {
    async applyEvent(bakeId, event, ctx) {
      let outcome: LiveResult<ApplyEventValue>;
      try {
        outcome = await repos.transaction(async (tx): Promise<LiveResult<ApplyEventValue>> => {
          const aggregate = await tx.bakes.get(bakeId);
          if (!aggregate) return fail('notFound');
          if (!OPEN.includes(aggregate.bake.status)) return fail('notActive');
          const { plan, progress, rows } = toBakePlan(aggregate);
          const row = rows.get(event.key);
          if (!row) return fail('unknownStep');

          // Bounds live here, not in core (Q-A3): core accepts any `at`.
          if (
            event.type === 'stepDone' ||
            event.type === 'stepStarted' ||
            event.type === 'foldDone'
          ) {
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

          const preImage = await tx.bakes.snapshotRows(
            bakeId,
            updates.map((u) => u.id),
          );
          if (!preImage) return fail('notFound');
          // Header first, guarded on the status: if it was closed meanwhile, nothing is written.
          if (!(await tx.bakes.updateIfStatus(bakeId, patch))) return fail('notActive');
          if (updates.length > 0) await tx.bakes.updateSteps(bakeId, updates);
          const after = await tx.bakes.get(bakeId);
          return {
            ok: true,
            value: {
              result,
              revertToken: { bakeId, preImage, postUpdatedAt: after?.bake.updatedAt ?? '' },
            },
          };
        });
      } catch (error) {
        logger.error('live.apply_failed', error);
        throw error;
      }
      if (outcome.ok) {
        await onChange();
        await notifyBakeProgressChanged(bakeId, 'event');
      }
      return outcome;
    },

    async revert(revertToken) {
      // The header only restores if nothing has written since (`updated_at` still matches), and
      // the step rows are restored in that same transaction.
      const restored = await repos.bakes.restoreRows(
        revertToken.preImage,
        revertToken.postUpdatedAt,
      );
      if (!restored) return { ok: false, reason: 'stale' };
      await onChange();
      await notifyBakeProgressChanged(revertToken.bakeId, 'revert');
      return { ok: true };
    },

    async finish(bakeId, now) {
      const outcome = await repos.transaction(
        async (tx): Promise<LiveResult<{ revertToken: RevertToken }>> => {
          const aggregate = await tx.bakes.get(bakeId);
          if (!aggregate) return fail('notFound');
          if (!OPEN.includes(aggregate.bake.status)) return fail('notActive');
          const preImage = await tx.bakes.snapshotRows(bakeId, []);
          if (!preImage) return fail('notFound');
          const ok = await tx.bakes.updateIfStatus(bakeId, {
            status: 'completed',
            completedAt: toIso(now),
          });
          if (!ok) return fail('notActive');
          const after = await tx.bakes.get(bakeId);
          return {
            ok: true,
            value: {
              revertToken: { bakeId, preImage, postUpdatedAt: after?.bake.updatedAt ?? '' },
            },
          };
        },
      );
      if (outcome.ok) {
        await onChange();
        await notifyBakeProgressChanged(bakeId, 'finish');
      }
      return outcome;
    },

    async cancel(bakeId, now) {
      const outcome = await repos.transaction(async (tx): Promise<LiveResult<null>> => {
        const aggregate = await tx.bakes.get(bakeId);
        if (!aggregate) return fail('notFound');
        const ok = await tx.bakes.updateIfStatus(bakeId, {
          status: 'cancelled',
          cancelledAt: toIso(now),
        });
        return ok ? { ok: true, value: null } : fail('notActive');
      });
      if (outcome.ok) {
        await onChange();
        await notifyBakeProgressChanged(bakeId, 'cancel');
      }
      return outcome;
    },

    sweep(now) {
      if (sweeping) return sweeping;
      const run = (async () => {
        const open = await repos.bakes.list({ statuses: OPEN });
        const changed: string[] = [];
        for (const header of open) {
          // Re-read and write in one transaction, guarded on the status it was read with: a
          // cancel or finish in between wins and the sweep leaves that bake alone.
          const didChange = await repos.transaction(async (tx) => {
            const aggregate = await tx.bakes.get(header.id);
            if (!aggregate || !OPEN.includes(aggregate.bake.status)) return false;
            const { bake } = aggregate;
            if (fromIso(bake.plannedReadyAt) < now - STALE_AFTER_MS) {
              // Step rows stay as they are: nothing was marked, and nothing is invented.
              return tx.bakes.updateIfStatus(
                header.id,
                { status: 'completed', completedAt: bake.plannedReadyAt },
                [bake.status],
              );
            }
            if (bake.status === 'scheduled') {
              const first = aggregate.steps.reduce(
                (m, s) => Math.min(m, fromIso(s.plannedStartAt)),
                Number.POSITIVE_INFINITY,
              );
              if (Number.isFinite(first) && now >= first) {
                return tx.bakes.updateIfStatus(
                  header.id,
                  { status: 'active', startedAt: toIso(first) },
                  ['scheduled'],
                );
              }
            }
            return false;
          });
          if (didChange) changed.push(header.id);
        }
        if (changed.length > 0) {
          await onChange();
          for (const id of changed) await notifyBakeProgressChanged(id, 'sweep');
        }
        return changed;
      })();
      sweeping = run.finally(() => {
        sweeping = null;
      });
      return sweeping;
    },
  };
}
