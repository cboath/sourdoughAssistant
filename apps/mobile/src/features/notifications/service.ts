/**
 * The notification service (ADR 0011 sections 1 to 3, architecture section 9). Dependencies are
 * injected so it runs under Jest without expo-notifications: a repository reader, a `NotifierPort`,
 * a clock and the flags.
 *
 * Rules that matter:
 * - It only ever lists and cancels ids in our `sa1:` namespace. `satest:` ids are never touched,
 *   and `cancelAllScheduledNotificationsAsync` is never used.
 * - Reconcile is single-flight: a request that arrives mid-run queues exactly one more run.
 * - Logs carry counts only: no ids, titles, bodies, recipe names or notes.
 */
import type { BakeAggregate, Bake } from '../../db/types';
import { logger } from '../../lib/logger';
import { CHANNEL, MIN_LEAD_MS, NAMESPACE, TEST_DELAY_MS, TEST_PREFIX } from './constants';
import { cleanText } from './content';
import { bakeIdPrefix, intentHash, planNotifications } from './planner';
import { usePermissions } from './store';
import { t } from '../../lib/i18n';
import type { NotificationIntent, NotifierPort, ReconcileMode, ReconcileResult } from './types';

/** The slice of the bake repository the service reads. */
export interface BakeReader {
  list(options?: { statuses?: readonly Bake['status'][] }): Promise<Bake[]>;
  get(id: string): Promise<BakeAggregate | null>;
}

export interface NotificationServiceDeps {
  bakes: BakeReader;
  notifier: NotifierPort;
  now(): number;
  zone(): string;
  locale?: string;
  /** `flags.readyNotification`, read on each run so tests can flip it. */
  readyEnabled(): boolean;
}

export interface NotificationService {
  /** Compares the desired set with the OS and fixes the difference. Safe to call any number of times. */
  reconcile(options?: { mode?: ReconcileMode }): Promise<ReconcileResult>;
  /** Cancels every pending request one bake owns, without reading the database. */
  cancelBake(bakeId: string): Promise<number>;
  /** Cancels or reschedules one bake's reminders after the live view changed it: a `diff` reconcile. */
  rescheduleBake(bakeId: string): Promise<ReconcileResult>;
  /** Schedules one test reminder 10 s from now, replacing any pending one. Returns false on failure or when notifications are off. */
  scheduleTestReminder(): Promise<boolean>;
  /** Re-reads the OS permission state into the store. */
  refreshPermissions(): Promise<void>;
}

const EMPTY: ReconcileResult = {
  status: 'ok',
  scheduled: 0,
  cancelled: 0,
  kept: 0,
  failed: 0,
  trimmed: { critical: 0, other: 0 },
};

export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const { notifier } = deps;

  async function refreshPermissions(): Promise<void> {
    const [notifications, exactAlarm] = await Promise.all([
      notifier.getPermission(),
      notifier.getExactAlarm(),
    ]);
    usePermissions.getState().set({ notifications, exactAlarm });
  }

  async function loadBakes(): Promise<BakeAggregate[]> {
    const headers = await deps.bakes.list({ statuses: ['scheduled', 'active'] });
    const loaded = await Promise.all(headers.map((b) => deps.bakes.get(b.id)));
    return loaded.filter((a): a is BakeAggregate => a !== null);
  }

  async function run(mode: ReconcileMode): Promise<ReconcileResult> {
    const [permission, exact] = await Promise.all([
      notifier.getPermission(),
      notifier.getExactAlarm(),
    ]);
    const store = usePermissions.getState();
    store.set({ notifications: permission, exactAlarm: exact });

    // Nothing would show. Leave the OS queue alone: a grant triggers a rebuild.
    if (permission !== 'granted') {
      logger.info('notif.reconcile_skipped', { denied: permission === 'denied' });
      return { ...EMPTY, status: permission };
    }

    const bakes = await loadBakes();
    const plan = planNotifications({
      bakes,
      nowMs: deps.now(),
      zone: deps.zone(),
      locale: deps.locale,
      platform: notifier.platform,
      exactAlarm: exact === 'granted',
      readyEnabled: deps.readyEnabled(),
    });

    const pending = (await notifier.listPending()).filter((p) =>
      p.identifier.startsWith(NAMESPACE),
    );
    const desired = new Map(plan.intents.map((i) => [i.id, i]));
    const pendingById = new Map(pending.map((p) => [p.identifier, p]));

    // Changed hashes in a diff are cancelled before scheduling (ADR 0011 section 2); ids nobody
    // wants are cancelled after it.
    const cancelFirst = new Set<string>();
    const toCancel = new Set<string>();
    const toSchedule: NotificationIntent[] = [];
    let kept = 0;
    // Only ids nobody wants are cancelled. A wanted id is scheduled again instead, and the same
    // id replaces the old request, so a kill between the steps never leaves the baker with no
    // reminders (SEC-M45-06).
    for (const p of pending) {
      if (!desired.has(p.identifier)) toCancel.add(p.identifier);
    }
    for (const intent of plan.intents) {
      const existing = pendingById.get(intent.id);
      if (mode === 'diff' && existing && existing.hash === intent.data.hash) {
        kept += 1;
        continue;
      }
      // Diff keeps ADR 0011 section 2: a changed hash is cancelled, then scheduled. A rebuild
      // schedules over the same id instead, so there is never a moment with nothing pending.
      if (existing && mode === 'diff') cancelFirst.add(intent.id);
      toSchedule.push(intent);
    }

    let cancelled = 0;
    const cancelIds = async (ids: Iterable<string>) => {
      for (const id of ids) {
        try {
          await notifier.cancel(id);
          cancelled += 1;
        } catch (error) {
          logger.warn('notif.cancel_failed');
          logger.error('notif.cancel_error', error);
        }
      }
    };
    await cancelIds(cancelFirst);
    let scheduled = 0;
    let failed = 0;
    for (const intent of toSchedule) {
      try {
        await notifier.schedule(intent);
        scheduled += 1;
      } catch (error) {
        failed += 1;
        logger.error('notif.schedule_error', error, { kindIsFold: intent.kind === 'fold' });
      }
    }

    await cancelIds(toCancel);

    store.set({
      failedCount: failed,
      failedAttempts: failed === 0 ? 0 : usePermissions.getState().failedAttempts,
      budgetTrimmed: plan.trimmed.critical + plan.trimmed.other > 0,
    });
    logger.info('notif.reconciled', {
      rebuild: mode === 'rebuild',
      desired: plan.intents.length,
      scheduled,
      cancelled,
      kept,
      failed,
      trimmedCritical: plan.trimmed.critical,
      trimmedOther: plan.trimmed.other,
    });
    return {
      status: failed > 0 ? 'error' : 'ok',
      scheduled,
      cancelled,
      kept,
      failed,
      trimmed: plan.trimmed,
    };
  }

  // Single flight: at most one run in progress and one queued behind it. `rebuild` beats `diff`.
  let running: Promise<ReconcileResult> | null = null;
  let queued: { mode: ReconcileMode; promise: Promise<ReconcileResult> } | null = null;

  function reconcile(options?: { mode?: ReconcileMode }): Promise<ReconcileResult> {
    const mode = options?.mode ?? 'diff';
    const safeRun = async (m: ReconcileMode): Promise<ReconcileResult> => {
      try {
        return await run(m);
      } catch (error) {
        logger.error('notif.reconcile_failed', error);
        return { ...EMPTY, status: 'error', failed: 1 };
      }
    };
    if (!running) {
      const current = safeRun(mode).finally(() => {
        running = null;
      });
      running = current;
      return current;
    }
    if (queued) {
      if (mode === 'rebuild') queued.mode = 'rebuild';
      return queued.promise;
    }
    const slot: { mode: ReconcileMode; promise: Promise<ReconcileResult> } = {
      mode,
      promise: Promise.resolve(EMPTY),
    };
    slot.promise = (running as Promise<ReconcileResult>).then(() => {
      queued = null;
      return reconcile({ mode: slot.mode });
    });
    queued = slot;
    return slot.promise;
  }

  return {
    reconcile,

    async cancelBake(bakeId) {
      const prefix = bakeIdPrefix(bakeId);
      let count = 0;
      try {
        const pending = await notifier.listPending();
        for (const p of pending) {
          if (!p.identifier.startsWith(prefix)) continue;
          await notifier.cancel(p.identifier);
          count += 1;
        }
      } catch (error) {
        logger.error('notif.cancel_bake_failed', error);
      }
      logger.info('notif.bake_cancelled', { count });
      return count;
    },

    async rescheduleBake() {
      return reconcile({ mode: 'diff' });
    },

    async scheduleTestReminder() {
      try {
        if ((await notifier.getPermission()) !== 'granted') return false;
        const pending = await notifier.listPending();
        for (const p of pending) {
          if (p.identifier.startsWith(TEST_PREFIX)) await notifier.cancel(p.identifier);
        }
        const exact = (await notifier.getExactAlarm()) === 'granted';
        const fireAtMs = deps.now() + Math.max(TEST_DELAY_MS, MIN_LEAD_MS);
        const base = {
          id: `${TEST_PREFIX}${deps.now()}`,
          kind: 'test' as const,
          bakeId: null,
          fireAtMs,
          title: cleanText(t('notif.test.title')),
          body: cleanText(t('notif.test.body')),
          ...(notifier.platform === 'ios'
            ? { interruptionLevel: 'timeSensitive' as const }
            : {
                channelId: CHANNEL.steps,
                delivery: exact ? ('alarmClock' as const) : ('bestEffort' as const),
              }),
        };
        const hash = intentHash(base);
        await notifier.schedule({
          ...base,
          data: { v: 1, kind: 'test', fireAt: new Date(fireAtMs).toISOString(), hash },
        });
        return true;
      } catch (error) {
        logger.error('notif.test_failed', error);
        return false;
      }
    },

    refreshPermissions,
  };
}
