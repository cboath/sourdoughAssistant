/**
 * The ready-time card, "Hold ready time" and the oven-conflict banner (screens-bake.md 8.6).
 * Everything here is derived from the stored rows, so it survives closing the screen: the hold
 * numbers come from core's `holdCapacity`, the conflict from a no-op recompute (core is the only
 * place that knows the slot rules).
 */
import { holdCapacity, recomputePlan, type IanaZone } from '@sourdough/core';
import type { BakeAggregate } from '../../db/types';
import { t, tp } from '../../lib/i18n';
import { formatDuration } from '../recipes/format';
import { formatClock } from '../schedule/time';
import type { BakeLive, ItemLive } from './derive';
import { READY_MOVED_MIN } from './derive';
import { toBakePlan } from './plan';

const MIN_MS = 60_000;

export interface TimeCtx {
  zone: IanaZone;
  locale: string;
  now: number;
}

export interface HoldAction {
  holdKey: string;
  /** Signed minutes for the `extend` event. */
  minutes: number;
  holdName: string;
  newDurationMin: number;
  /** What the item's ready time becomes. */
  newReadyAt: number;
  hint: string;
}

export interface ReadyMovedModel {
  itemId: string;
  recipe: string;
  /** Dismissal is per bake, item and ready time, so a new change shows the card again. */
  dismissKey: string;
  variant: 'info' | 'warning';
  message: string;
  line: string | null;
  hold: HoldAction | null;
}

export function readyMovedModels(
  aggregate: BakeAggregate,
  live: BakeLive,
  ctx: TimeCtx,
): ReadyMovedModel[] {
  if (live.status === 'completed') return [];
  const { plan } = toBakePlan(aggregate);
  const multi = live.items.length > 1;
  const models: ReadyMovedModel[] = [];

  for (const item of live.items) {
    if (item.phase === 'done' || Math.abs(item.deltaMin) < READY_MOVED_MIN) continue;
    const later = item.deltaMin > 0;
    const delta = Math.abs(item.deltaMin);
    const time = formatClock(item.readyAt, ctx.zone, ctx.locale);
    const duration = formatDuration(delta, ctx.locale);
    const message = multi
      ? t('live.readyMoved.item', {
          recipe: item.name,
          time,
          duration,
          direction: t(later ? 'live.delta.laterWord' : 'live.delta.earlierWord'),
        })
      : t(later ? 'live.readyMoved.later' : 'live.readyMoved.earlier', { time, duration });

    let line: string | null = null;
    let hold: HoldAction | null = null;
    const capacity = holdCapacity(plan, item.itemId);
    const holdRow = capacity
      ? aggregate.steps.find((s) => s.stepKey === capacity.holdKey)
      : undefined;
    if (capacity && holdRow && holdRow.status === 'pending') {
      const holdName = holdRow.name;
      const current = holdRow.durationMin;
      const clock = (at: number) => formatClock(at, ctx.zone, ctx.locale);
      const make = (minutes: number): HoldAction => {
        const newDurationMin = current + minutes;
        return {
          holdKey: capacity.holdKey,
          minutes,
          holdName,
          newDurationMin,
          newReadyAt: item.readyAt + minutes * MIN_MS,
          hint: t(minutes < 0 ? 'live.hold.hintShorten' : 'live.hold.hintLengthen', {
            holdStep: holdName,
            duration: formatDuration(newDurationMin, ctx.locale),
          }),
        };
      };
      if (later) {
        const room = capacity.canAbsorbLateMin;
        if (room >= delta) {
          hold = make(-delta);
          line = t('live.hold.shorten', {
            holdStep: holdName,
            duration: formatDuration(hold.newDurationMin, ctx.locale),
            time: clock(hold.newReadyAt),
          });
        } else if (room > 0) {
          hold = make(-room);
          line = t('live.hold.partial', {
            holdStep: holdName,
            min: formatDuration(hold.newDurationMin, ctx.locale),
            time: clock(hold.newReadyAt),
          });
        } else {
          line = t('live.hold.cant', {
            holdStep: holdName,
            min: formatDuration(holdRow.minMin, ctx.locale),
          });
        }
      } else {
        const room = capacity.canAbsorbEarlyMin;
        if (room >= delta) {
          hold = make(delta);
          line = t('live.hold.lengthen', {
            holdStep: holdName,
            duration: formatDuration(hold.newDurationMin, ctx.locale),
            time: clock(hold.newReadyAt),
          });
        } else if (room > 0) {
          hold = make(room);
          line = t('live.hold.partialEarly', {
            holdStep: holdName,
            max: formatDuration(hold.newDurationMin, ctx.locale),
            time: clock(hold.newReadyAt),
          });
        }
      }
    }

    models.push({
      itemId: item.itemId,
      recipe: item.name,
      dismissKey: `${aggregate.bake.id}:${item.itemId}:${item.readyAt}`,
      variant: delta >= 60 ? 'warning' : 'info',
      message,
      line,
      hold,
    });
  }
  return models;
}

/** The oven-conflict sentence, or null when the stored plan has no conflict. */
export function ovenConflictText(
  aggregate: BakeAggregate,
  live: BakeLive,
  ctx: TimeCtx,
): string | null {
  if (live.status === 'completed' || aggregate.bake.ovenSlots.length < 2) return null;
  const { plan, progress } = toBakePlan(aggregate);
  const open = new Set(
    progress.filter((p) => p.status === 'pending' || p.status === 'active').map((p) => p.key),
  );
  const probe = plan.steps.find((s) => s.itemId !== null && !s.isAlongside && open.has(s.key));
  if (!probe) return null;
  // Extending by zero changes nothing, but core re-runs its slot checks on the stored plan.
  const result = recomputePlan(
    plan,
    progress,
    { type: 'extend', key: probe.key, minutes: 0 },
    {
      now: ctx.now,
    },
  );
  if (!result.ok) return null;
  const conflict = result.value.plan.warnings.find((w) => w.code === 'ovenConflict');
  if (!conflict || conflict.code !== 'ovenConflict') return null;
  const slot = result.value.plan.slots.find((s) => s.index === conflict.slotIndexes[1]);
  const moved: ItemLive | undefined = live.items.find((i) => i.deltaMin !== 0) ?? live.items[0];
  const who =
    live.items.length > 1 && moved
      ? t('live.ovenConflict.who', { letter: moved.letter })
      : t('live.ovenConflict.whoSingle');
  return tp('live.ovenConflict', aggregate.bake.ovenCapacity, {
    who,
    slot: conflict.slotIndexes[1],
    from: slot ? formatClock(slot.startAt, ctx.zone, ctx.locale) : '',
    to: slot ? formatClock(slot.endAt, ctx.zone, ctx.locale) : '',
  });
}
