/**
 * Every write the live view can make, with its haptic, snackbar, undo and announcement
 * (screens-bake.md 0.7, 0.8, 8.7). The screen passes the aggregate and derived state in; this
 * hook sends one event to `bakeService`, then reports the result.
 */
import type { RecomputeEvent } from '@sourdough/core';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BakeAggregate, BakeStep } from '../../../db/types';
import { clock } from '../../../lib/clock';
import { t } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { showSnackbar } from '../../../state/snackbar';
import { haptic } from '../../../ui/haptics';
import { useLocale } from '../../../ui/hooks/useLocale';
import { reportRejected, showUndoSnackbar } from '../feedback';
import { useBakeService } from '../../schedule/hooks/useScheduleData';
import { formatClock } from '../../schedule/time';
import type { BakeLive, ItemLive } from '../derive';
import { signedMinutes } from '../format';
import { labelFor, type HeroModel } from '../panel';
import type { HoldAction } from '../ready';
import type { ApplyEventValue, RevertToken } from '../services/liveOps';
import { routes } from '../../../lib/nav';
import { formatDuration, spokenDuration } from '../../recipes/format';

/** The hero is disabled this long after a tap so one knuckle bump can't finish two steps. */
export const HERO_BUSY_MS = 400;
const SHIFT_SNACK_MIN = 5;

interface RunOptions {
  event: RecomputeEvent;
  finish?: boolean;
  feedback: 'success' | 'selection';
  message: (value: ApplyEventValue, now: number) => string;
  announce?: (value: ApplyEventValue) => string | null;
}

export function useLiveActions(aggregate: BakeAggregate | null | undefined, live: BakeLive | null) {
  const service = useBakeService();
  const router = useRouter();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const undoable = useCallback(
    (message: string, token: RevertToken, spokenMessage?: string) =>
      showUndoSnackbar(service, message, token, spokenMessage),
    [service],
  );

  const failed = reportRejected;

  const guard = useCallback(async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    const started = Date.now();
    try {
      return await work();
    } catch (error) {
      logger.error('live.action_failed', error);
      showSnackbar({ message: t('live.actionFailed') });
      return undefined;
    } finally {
      const wait = Math.max(0, HERO_BUSY_MS - (Date.now() - started));
      timer.current = setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, wait);
    }
  }, []);

  const run = useCallback(
    async (options: RunOptions): Promise<boolean> => {
      if (!aggregate) return false;
      const outcome = await guard(async () => {
        const now = clock.now();
        const result = await service.applyEvent(aggregate.bake.id, options.event, {
          now,
          ...(options.finish ? { finish: true } : {}),
        });
        if (!result.ok) {
          failed(result.error);
          return false;
        }
        haptic(options.feedback);
        // One combined announcement: iOS cuts one off with the next (DR2-06).
        const message = options.message(result.value, now);
        const next = options.announce?.(result.value);
        undoable(message, result.value.revertToken, next ? `${message} ${next}` : undefined);
        return true;
      });
      return outcome === true;
    },
    [aggregate, guard, service, failed, undoable],
  );

  const zone = () => clock.zone();
  const clockText = (at: number) => formatClock(at, zone(), locale);
  const stepOf = (key: string, value: ApplyEventValue) =>
    value.result.plan.steps.find((s) => s.key === key);

  const finishedMessage = () =>
    t('home.finished.snack', {
      recipe: (aggregate?.items ?? []).map((i) => i.recipeSnapshot.recipe.name).join(', '),
    });

  const shiftText = (value: ApplyEventValue, name: string) => {
    const delta = value.result.deltaMin;
    return Math.abs(delta) < SHIFT_SNACK_MIN
      ? t('live.done.snack', { step: name })
      : t('live.done.snackShift', {
          step: name,
          time: clockText(value.result.plan.readyAt),
          delta: signedMinutes(delta, locale),
        });
  };

  /** The hero button of one item. */
  const onHero = useCallback(
    async (item: ItemLive, hero: HeroModel): Promise<void> => {
      if (!aggregate || !live || !item.current) return;
      const row = item.current;
      const name = labelFor(aggregate, row);
      const others = live.items.filter((i) => i.itemId !== item.itemId);
      const lastOpen = others.every((i) => i.phase === 'done' || i.phase === 'ready');
      const nextName = item.next ? labelFor(aggregate, item.next) : null;
      const announceNext = (value: ApplyEventValue) => {
        if (!nextName) return null;
        const upcoming = item.next ? stepOf(item.next.stepKey, value) : undefined;
        return t('live.announce.step', {
          step: nextName,
          duration: upcoming ? spokenDuration(upcoming.durationMin, locale) : '',
        });
      };

      if (hero.kind === 'startNow') {
        await run({
          event: { type: 'stepStarted', key: row.stepKey, at: clock.now() },
          feedback: 'success',
          message: (v) => t('live.startNow.snack', { time: clockText(v.result.plan.readyAt) }),
        });
        return;
      }
      if (hero.kind === 'foldDone' && item.fold && item.fold.next !== null) {
        const n = item.fold.next;
        await run({
          event: { type: 'foldDone', key: row.stepKey, foldIndex: n, at: clock.now() },
          feedback: 'success',
          message: (v) => {
            const step = stepOf(row.stepKey, v);
            if (n >= item.fold!.count) {
              return t('live.fold.snackLast', {
                next: nextName ?? name,
                time: clockText(step?.endAt ?? clock.now()),
              });
            }
            const nextFold = step?.folds.find((f) => f.index === n + 1);
            return t('live.fold.snack', { n, time: clockText(nextFold?.at ?? clock.now()) });
          },
        });
        return;
      }
      if (hero.kind === 'finish') {
        const at = Math.min(clock.now(), Date.parse(row.plannedEndAt));
        await run({
          event: { type: 'stepDone', key: row.stepKey, at },
          finish: lastOpen,
          feedback: 'success',
          message: () => finishedMessage(),
        });
        return;
      }
      await run({
        event: { type: 'stepDone', key: row.stepKey, at: clock.now() },
        finish: item.isFinal && lastOpen,
        feedback: 'success',
        message: (v) => (item.isFinal ? finishedMessage() : shiftText(v, name)),
        announce: announceNext,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aggregate, live, run, locale],
  );

  /** "Start {next} now" during folds: ends the folds step early. */
  const onSkipFolds = useCallback(
    async (item: ItemLive) => {
      if (!aggregate || !item.current) return;
      const name = labelFor(aggregate, item.current);
      await run({
        event: { type: 'stepDone', key: item.current.stepKey, at: clock.now() },
        feedback: 'success',
        message: (v) => shiftText(v, name),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aggregate, run, locale],
  );

  const onExtend = useCallback(
    async (item: ItemLive) => {
      if (!aggregate || !item.current) return;
      const name = labelFor(aggregate, item.current);
      await run({
        event: { type: 'extend', key: item.current.stepKey, minutes: 15 },
        feedback: 'selection',
        message: (v) =>
          t('live.extend.snack', { step: name, time: clockText(v.result.plan.readyAt) }),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aggregate, run, locale],
  );

  const onAlsoDone = useCallback(
    async (row: BakeStep) => {
      if (!aggregate) return;
      await run({
        event: { type: 'stepDone', key: row.stepKey, at: clock.now() },
        feedback: 'success',
        message: () => t('live.alongside.snack', { step: labelFor(aggregate, row) }),
      });
    },
    [aggregate, run],
  );

  const onHold = useCallback(
    async (hold: HoldAction) => {
      await run({
        event: { type: 'extend', key: hold.holdKey, minutes: hold.minutes },
        feedback: 'selection',
        message: () =>
          t('live.hold.snack', {
            time: clockText(hold.newReadyAt),
            holdStep: hold.holdName,
            duration: formatDuration(hold.newDurationMin, locale),
          }),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, locale],
  );

  /** "Finished earlier? Set the time" (B9): `stepDone` with a past time. */
  const onFinishedAt = useCallback(
    async (item: ItemLive, at: number): Promise<boolean> => {
      if (!aggregate || !item.current) return false;
      const name = labelFor(aggregate, item.current);
      const others = (live?.items ?? []).filter((i) => i.itemId !== item.itemId);
      return run({
        event: { type: 'stepDone', key: item.current.stepKey, at },
        finish: item.isFinal && others.every((i) => i.phase === 'done' || i.phase === 'ready'),
        feedback: 'success',
        message: (v) => shiftText(v, name),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aggregate, live, run, locale],
  );

  const openBake = useCallback((id: string) => router.replace(routes.bake(id)), [router]);

  return {
    busy,
    onHero,
    onSkipFolds,
    onExtend,
    onAlsoDone,
    onHold,
    onFinishedAt,
    openBake,
  };
}
