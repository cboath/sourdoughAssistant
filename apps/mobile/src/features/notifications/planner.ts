/**
 * The pure notification planner (ADR 0011 sections 1 to 4). Given the active bakes, the instant
 * and the platform, it returns the desired pending set. No React, no expo-notifications, no I/O.
 *
 * Quiet hours deliberately do not change anything here: they only produce plan warnings (ADR 0010
 * section 5, ADR 0011 section 2), because a step that needs the baker at 3 AM must still ring.
 */
import { stepLabel, letterFor } from '../schedule/labels';
import type { BakeAggregate, BakeItem, BakeStep } from '../../db/types';
import { t } from '../../lib/i18n';
import {
  ANDROID_BUDGET,
  CHANNEL,
  IOS_BUDGET,
  MAX_COALESCED_IDS,
  MIN_LEAD_MS,
  NAMESPACE,
  SENTINEL_ID,
} from './constants';
import { cleanText, formatDayTime } from './content';
import { fnv1a } from './hash';
import type {
  IntentKind,
  NotificationIntent,
  PlannerInput,
  PlannerResult,
  Platform,
} from './types';

const MINUTE = 60_000;

export const stepNotificationId = (
  bakeId: string,
  stepKey: string,
  kind: 'start' | 'fold' | 'headsup',
  foldIndex?: number,
): string => `${NAMESPACE}${bakeId}:${stepKey}:${kind}${foldIndex ? `:${foldIndex}` : ''}`;

export const readyNotificationId = (bakeId: string, itemId: string): string =>
  `${NAMESPACE}${bakeId}:${itemId}:ready`;

/** The id prefix of everything one bake owns. */
export const bakeIdPrefix = (bakeId: string): string => `${NAMESPACE}${bakeId}:`;

/** Hash over what the user would notice changing (ADR 0011 section 2). */
export function intentHash(
  i: Pick<
    NotificationIntent,
    'fireAtMs' | 'title' | 'body' | 'channelId' | 'delivery' | 'interruptionLevel'
  >,
): string {
  return fnv1a(
    [
      new Date(i.fireAtMs).toISOString(),
      i.title,
      i.body,
      i.channelId ?? '',
      i.delivery ?? '',
      i.interruptionLevel ?? '',
    ].join('\u0001'),
  );
}

interface Candidate {
  kind: 'start' | 'fold';
  fireAtMs: number;
  step: BakeStep;
  foldIndex?: number;
  foldCount?: number;
  label: string;
  recipe: string;
}

interface Delivery {
  channelId?: NotificationIntent['channelId'];
  delivery?: NotificationIntent['delivery'];
  interruptionLevel?: NotificationIntent['interruptionLevel'];
}

function deliveryFor(
  tier: 'critical' | 'other' | 'general',
  platform: Platform,
  exactAlarm: boolean,
): Delivery {
  if (platform === 'ios') {
    return { interruptionLevel: tier === 'critical' ? 'timeSensitive' : 'active' };
  }
  if (tier === 'critical') {
    return { channelId: CHANNEL.steps, delivery: exactAlarm ? 'alarmClock' : 'bestEffort' };
  }
  return {
    channelId: tier === 'other' ? CHANNEL.headsUp : CHANNEL.general,
    delivery: 'bestEffort',
  };
}

function finish(
  base: Omit<NotificationIntent, 'data'> & {
    data: Omit<NotificationIntent['data'], 'hash' | 'fireAt'>;
  },
): NotificationIntent {
  const hash = intentHash(base);
  return {
    ...base,
    data: { ...base.data, fireAt: new Date(base.fireAtMs).toISOString(), hash },
  };
}

/** Recipe label per item, and the list label for bake-wide steps. */
function recipeLabels(
  aggregate: BakeAggregate,
  duplicated: ReadonlySet<string>,
  input: PlannerInput,
) {
  const { bake, items } = aggregate;
  const multi = items.length > 1;
  const readyText = formatDayTime(Date.parse(bake.plannedReadyAt), input.zone, input.locale);
  const disambiguate = (text: string, name: string) =>
    duplicated.has(name)
      ? t('notif.recipeDisambiguated', { recipe: text, dayTime: readyText })
      : text;

  const byItem = new Map<string, string>();
  items.forEach((item, index) => {
    const name = cleanText(item.recipeSnapshot.recipe.name);
    const labelled = multi
      ? t('notif.recipeItem', { recipe: name, letter: letterFor(index) })
      : name;
    byItem.set(item.id, disambiguate(labelled, name));
  });
  const names = items.map((item) => cleanText(item.recipeSnapshot.recipe.name));
  const list = names.join(', ');
  const wide = names.some((n) => duplicated.has(n))
    ? t('notif.recipeDisambiguated', { recipe: list, dayTime: readyText })
    : list;
  return { byItem, wide };
}

function slotLoaves(aggregate: BakeAggregate, step: BakeStep, item: BakeItem | undefined) {
  if (step.slotIndex === null || !item) return null;
  const slot = aggregate.bake.ovenSlots.find((s) => s.index === step.slotIndex);
  return slot?.loaves.find((l) => l.bakeItemId === item.id)?.loaves ?? null;
}

function foldReminderTimes(step: BakeStep, startMs: number): Array<{ index: number; at: number }> {
  const count = step.foldCount ?? 0;
  const interval = step.foldIntervalMin ?? 0;
  if (count < 2 || interval <= 0) return [];
  const done = Math.max(0, step.foldsDone);
  const lastDone = done > 0 ? Date.parse(step.foldTimes[done - 1] ?? '') : Number.NaN;
  const out: Array<{ index: number; at: number }> = [];
  for (let k = Math.max(2, done + 1); k <= count; k += 1) {
    // Later folds re-anchor from the last recorded fold (core-api section 5.6).
    const at = Number.isFinite(lastDone)
      ? lastDone + (k - done) * interval * MINUTE
      : startMs + (k - 1) * interval * MINUTE;
    out.push({ index: k, at });
  }
  return out;
}

interface BakeIntents {
  critical: NotificationIntent[];
  other: NotificationIntent[];
}

function planBake(
  aggregate: BakeAggregate,
  duplicated: ReadonlySet<string>,
  input: PlannerInput,
): BakeIntents {
  const { bake, items, steps } = aggregate;
  const earliest = input.nowMs + MIN_LEAD_MS;
  const itemById = new Map(items.map((item) => [item.id, item]));
  const labels = recipeLabels(aggregate, duplicated, input);
  const candidates: Candidate[] = [];
  const other: NotificationIntent[] = [];

  for (const step of steps) {
    if (!step.notify || (step.status !== 'pending' && step.status !== 'active')) continue;
    const item = step.bakeItemId ? itemById.get(step.bakeItemId) : undefined;
    const recipe = (item && labels.byItem.get(item.id)) ?? labels.wide;
    const label = cleanText(
      stepLabel(
        { name: step.name, slotIndex: step.slotIndex, loaves: slotLoaves(aggregate, step, item) },
        { slotCount: bake.ovenSlots.length, itemLoaves: item?.loaves },
      ),
    );
    const startMs = Date.parse(step.plannedStartAt);
    const folds = (step.foldCount ?? 0) >= 2 && (step.foldIntervalMin ?? 0) > 0;

    // An active step has started: only its remaining folds still need a reminder.
    if (step.status === 'pending' && startMs > earliest) {
      candidates.push({
        kind: 'start',
        fireAtMs: startMs,
        step,
        label,
        recipe,
        ...(folds ? { foldIndex: 1, foldCount: step.foldCount ?? 0 } : {}),
      });
    }
    if (step.status === 'pending' && bake.headsUpMin > 0) {
      const at = startMs - bake.headsUpMin * MINUTE;
      if (at > earliest) {
        other.push(
          finish({
            id: stepNotificationId(bake.id, step.stepKey, 'headsup'),
            kind: 'headsup',
            bakeId: bake.id,
            fireAtMs: at,
            title: cleanText(t('notif.headsup.title', { minutes: bake.headsUpMin, step: label })),
            body: cleanText(t('notif.headsup.body', { recipe })),
            ...deliveryFor('other', input.platform, input.exactAlarm),
            threadId: bake.id,
            data: {
              v: 1,
              kind: 'headsup',
              bakeId: bake.id,
              bakeStepId: step.id,
              stepKey: step.stepKey,
            },
          }),
        );
      }
    }
    if (folds) {
      for (const fold of foldReminderTimes(step, startMs)) {
        if (fold.at <= earliest) continue;
        candidates.push({
          kind: 'fold',
          fireAtMs: fold.at,
          step,
          foldIndex: fold.index,
          foldCount: step.foldCount ?? 0,
          label,
          recipe,
        });
      }
    }
  }

  if (input.readyEnabled) {
    for (const item of items) {
      const cools = steps.filter(
        (s) =>
          s.bakeItemId === item.id &&
          s.kind === 'cool' &&
          (s.status === 'pending' || s.status === 'active'),
      );
      const last = cools.reduce<BakeStep | null>(
        (best, s) =>
          !best || Date.parse(s.plannedEndAt) > Date.parse(best.plannedEndAt) ? s : best,
        null,
      );
      if (!last) continue;
      const at = Date.parse(last.plannedEndAt);
      if (at <= earliest) continue;
      other.push(
        finish({
          id: readyNotificationId(bake.id, item.id),
          kind: 'ready',
          bakeId: bake.id,
          fireAtMs: at,
          title: cleanText(t('notif.ready.title')),
          body: cleanText(
            t('notif.ready.body', { recipe: labels.byItem.get(item.id) ?? labels.wide }),
          ),
          ...deliveryFor('other', input.platform, input.exactAlarm),
          threadId: bake.id,
          data: {
            v: 1,
            kind: 'ready',
            bakeId: bake.id,
            bakeStepId: last.id,
            stepKey: last.stepKey,
          },
        }),
      );
    }
  }

  return { critical: coalesce(bake.id, candidates, input), other };
}

const KIND_ORDER: Record<'start' | 'fold', number> = { start: 0, fold: 1 };
const byCandidate = (a: Candidate, b: Candidate) =>
  a.fireAtMs - b.fireAtMs ||
  a.step.stepKey.localeCompare(b.step.stepKey) ||
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  (a.foldIndex ?? 0) - (b.foldIndex ?? 0);

/** Start and fold candidates of one bake that fire in the same minute become one notification. */
function coalesce(bakeId: string, all: Candidate[], input: PlannerInput): NotificationIntent[] {
  const groups = new Map<number, Candidate[]>();
  for (const c of [...all].sort(byCandidate)) {
    const bucket = Math.floor(c.fireAtMs / MINUTE);
    groups.set(bucket, [...(groups.get(bucket) ?? []), c]);
  }
  const level = deliveryFor('critical', input.platform, input.exactAlarm);
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const single = group.length === 1;
    const isFold = first.foldIndex !== undefined;
    const title = single
      ? isFold
        ? t('notif.fold.title', {
            step: first.label,
            n: first.foldIndex ?? 1,
            count: first.foldCount ?? 1,
          })
        : t('notif.start.title', { step: first.label })
      : t('notif.multi.title', { count: group.length });
    const body = single
      ? isFold
        ? t('notif.fold.body', { recipe: first.recipe })
        : t('notif.start.body', { recipe: first.recipe })
      : t('notif.multi.body', {
          list: group
            .map((c) => t('notif.multi.item', { step: c.label, recipe: c.recipe }))
            .join(', '),
        });
    const kind: IntentKind = first.kind;
    return finish({
      id: stepNotificationId(
        bakeId,
        first.step.stepKey,
        first.kind,
        first.kind === 'fold' ? first.foldIndex : undefined,
      ),
      kind,
      bakeId,
      fireAtMs: first.fireAtMs,
      title: cleanText(title),
      body: cleanText(body),
      ...level,
      threadId: bakeId,
      data: {
        v: 1,
        kind,
        bakeId,
        bakeStepId: first.step.id,
        stepKey: first.step.stepKey,
        ...(first.foldIndex !== undefined ? { foldIndex: first.foldIndex } : {}),
        ...(single
          ? {}
          : { bakeStepIds: [...new Set(group.map((c) => c.step.id))].slice(0, MAX_COALESCED_IDS) }),
      },
    });
  });
}

const byFireThenId = (a: NotificationIntent, b: NotificationIntent) =>
  a.fireAtMs - b.fireAtMs || a.id.localeCompare(b.id);

export function planNotifications(input: PlannerInput): PlannerResult {
  const budget = input.budget ?? (input.platform === 'ios' ? IOS_BUDGET : ANDROID_BUDGET);
  const live = input.bakes.filter(
    (a) => a.bake.status === 'scheduled' || a.bake.status === 'active',
  );

  // Two live bakes of one recipe need the ready time to tell them apart.
  const bakesPerName = new Map<string, number>();
  for (const a of live) {
    for (const name of new Set(a.items.map((i) => cleanText(i.recipeSnapshot.recipe.name)))) {
      bakesPerName.set(name, (bakesPerName.get(name) ?? 0) + 1);
    }
  }
  const duplicated = new Set([...bakesPerName].filter(([, n]) => n > 1).map(([name]) => name));

  const critical: NotificationIntent[] = [];
  const other: NotificationIntent[] = [];
  for (const a of live) {
    const planned = planBake(a, duplicated, input);
    critical.push(...planned.critical);
    other.push(...planned.other);
  }
  critical.sort(byFireThenId);
  other.sort(byFireThenId);

  // Selection (ADR 0011 section 3): the first `budget - 1` critical intents, then heads-ups and
  // `ready` up to the horizon H fill what remains, then one sentinel past the budget if needed.
  const takenCritical = critical.slice(0, Math.max(0, budget - 1));
  const leftOut = critical.length > takenCritical.length;
  const horizon = leftOut ? takenCritical[takenCritical.length - 1]!.fireAtMs : Infinity;
  // The sentinel's own slot comes out of the budget (QA04-B1), so the total never exceeds it.
  const room = Math.max(0, budget - takenCritical.length - (leftOut ? 1 : 0));
  const eligible = other.filter((i) => i.fireAtMs <= horizon);
  const takenOther = eligible.slice(0, room);

  const intents = [...takenCritical, ...takenOther];
  if (leftOut) {
    const fireAtMs = Math.max(horizon - MINUTE, input.nowMs + MIN_LEAD_MS + 1_000);
    intents.push(
      finish({
        id: SENTINEL_ID,
        kind: 'topup',
        bakeId: null,
        fireAtMs,
        title: cleanText(t('notif.topup.title')),
        body: cleanText(t('notif.topup.body')),
        ...deliveryFor('general', input.platform, input.exactAlarm),
        data: { v: 1, kind: 'topup' },
      }),
    );
  }
  intents.sort(byFireThenId);

  return {
    intents,
    trimmed: {
      critical: critical.length - takenCritical.length,
      other: other.length - takenOther.length,
    },
  };
}
