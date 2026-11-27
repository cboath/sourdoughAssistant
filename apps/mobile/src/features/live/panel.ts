/**
 * What the current-step panel and its hero button say (screens-bake.md 8.2 to 8.4, 8.11). Pure
 * view models over `ItemLive`, so wording, labels and which action a tap sends are tested without
 * rendering.
 */
import { isInQuietHours, type QuietHours } from '@sourdough/core';
import type { BakeAggregate, BakeStep } from '../../db/types';
import { t } from '../../lib/i18n';
import { formatDuration } from '../recipes/format';
import type { IconName } from '../../ui/components/Icon';
import type { StatusTone } from '../../ui/components/StatusTag';
import { stepLabel } from '../schedule/labels';
import { formatClock, formatDayTime, formatTemperature, spokenTemperature } from '../schedule/time';
import { fromIso } from '@sourdough/core';
import { formatCountdown, overText, spokenCountdown, spokenOver } from './format';
import { FINISHED_EARLIER_MS, type ItemLive } from './derive';
import type { TimeCtx } from './ready';

/** The display name of a step: plain, or with its loaf split when the oven takes several slots. */
export function labelFor(aggregate: BakeAggregate, row: BakeStep): string {
  const slot =
    row.slotIndex === null
      ? undefined
      : aggregate.bake.ovenSlots.find((s) => s.index === row.slotIndex);
  const loaves = slot?.loaves.find((l) => l.bakeItemId === row.bakeItemId)?.loaves ?? null;
  const item = aggregate.items.find((i) => i.id === row.bakeItemId);
  return stepLabel(
    { name: row.name, slotIndex: row.slotIndex, loaves },
    { slotCount: aggregate.bake.ovenSlots.length, itemLoaves: item?.loaves },
  );
}

export interface PanelTag {
  id: string;
  text: string;
  icon: IconName;
  tone: StatusTone;
}

export interface PanelModel {
  caption: string;
  captionIcon: IconName;
  stepName: string;
  /** "Step 4 of 10" */
  stepOf: string;
  countdown: string;
  countdownKind: 'time' | 'over' | 'text';
  /** What the countdown runs to or past; the live text is computed from it each second. Null for static text. */
  countdownTarget: number | null;
  sub: string | null;
  tags: PanelTag[];
  overtime: boolean;
  ready: boolean;
  /** Rebuilt once a minute by passing a minute-floored `now`. */
  a11yLabel: string;
  /** Overtime long enough to offer "Finished earlier? Set the time". */
  offerFinishedAt: boolean;
}

export function panelFor(
  aggregate: BakeAggregate,
  item: ItemLive,
  ctx: TimeCtx,
  quiet: QuietHours,
  unit: 'C' | 'F',
): PanelModel {
  const { locale, zone, now } = ctx;
  const current = item.current as BakeStep;
  const stepName = labelFor(aggregate, current);
  const stepOf = t('live.stepOf', { n: item.stepNumber, count: item.stepCount });
  const clock = (at: number) => formatClock(at, zone, locale);
  const end = fromIso(current.plannedEndAt);

  const tags: PanelTag[] = [];
  const bakeTemp = aggregate.bake.kitchenTempC;
  if (current.durationSource === 'temperature' && bakeTemp !== null) {
    tags.push({
      id: 'adjusted',
      text: t('live.adjusted', { temp: formatTemperature(bakeTemp, unit) }),
      icon: 'thermometer',
      tone: 'neutral',
    });
  }
  if (!current.foldCount) {
    if (current.durationMin > current.maxMin) {
      tags.push({
        id: 'long',
        text: t('live.longerThanMax', { max: formatDuration(current.maxMin, locale) }),
        icon: 'alarm',
        tone: 'warning',
      });
    } else if (current.durationMin < current.minMin) {
      tags.push({
        id: 'short',
        text: t('live.shorterThanMin', { min: formatDuration(current.minMin, locale) }),
        icon: 'alarm',
        tone: 'warning',
      });
    }
  }
  if (
    item.next &&
    item.next.notify &&
    isInQuietHours(fromIso(item.next.plannedStartAt), quiet, zone)
  ) {
    tags.push({ id: 'quiet', text: t('live.nextInQuiet'), icon: 'moon', tone: 'info' });
  }
  const tagsText = tags.map((tag) => tag.text).join('. ');

  const base = { stepOf, tags, overtime: false, ready: false, offerFinishedAt: false };

  if (item.phase === 'waiting') {
    const start = fromIso(current.plannedStartAt);
    const countdown = formatCountdown(start - now, locale);
    return {
      ...base,
      caption: t('live.startsIn'),
      captionIcon: 'clock',
      stepName,
      countdown,
      countdownKind: 'time',
      countdownTarget: start,
      sub: t('live.startsAt', { dayTime: formatDayTime(start, ctx) }),
      a11yLabel: t('live.panel.labelWaiting', {
        duration: spokenCountdown(start - now, locale),
        step: stepName,
        n: item.stepNumber,
        count: item.stepCount,
      }),
    };
  }

  if (item.phase === 'ready') {
    const since = t('live.readySince', { time: clock(item.readySince ?? end) });
    return {
      ...base,
      caption: t('live.now'),
      captionIcon: 'checkCircle',
      stepName: t('live.complete.title'),
      countdown: '',
      countdownKind: 'text',
      countdownTarget: null,
      sub: since,
      ready: true,
      a11yLabel: t('live.panel.labelReady', { since }),
    };
  }

  const fold = item.fold;
  let sub: string;
  let countdown: string;
  let kind: PanelModel['countdownKind'] = 'time';
  const target = item.targetAt ?? end;
  if (fold && fold.next !== null && fold.at !== null) {
    sub = t('live.fold.progress', { n: fold.next, count: fold.count, time: clock(fold.at) });
  } else if (fold) {
    sub = t('live.fold.lastRest', { time: clock(end) });
  } else if (item.next) {
    sub = t('live.until', { next: labelFor(aggregate, item.next), time: clock(end) });
  } else {
    sub = t('live.untilReady', { time: clock(end) });
  }

  const overtime = item.phase === 'overtime';
  if (overtime) {
    countdown = overText(item.overMs, locale);
    kind = 'over';
  } else if (fold && fold.due && fold.next !== null) {
    countdown = t('live.fold.now');
    kind = 'text';
  } else {
    countdown = formatCountdown(target - now, locale);
  }

  const timing = overtime
    ? t('live.panel.labelOver', { step: stepName, duration: spokenOver(item.overMs, locale) })
    : `${spokenCountdown(target - now, locale)} ${t('live.panel.left')}, ${sub}`;
  // Overtime says how long it has been over, not a past "until" time (DR2-14).
  const a11yLabel = overtime
    ? timing
    : t('live.panel.label', {
        step: stepName,
        n: item.stepNumber,
        count: item.stepCount,
        timing,
      });
  const spokenTags =
    bakeTemp !== null && tags.some((x) => x.id === 'adjusted')
      ? tagsText.replace(formatTemperature(bakeTemp, unit), spokenTemperature(bakeTemp, unit))
      : tagsText;

  return {
    ...base,
    caption: t('live.now'),
    captionIcon: overtime ? 'alarm' : 'play',
    stepName,
    countdown,
    countdownKind: kind,
    countdownTarget: kind === 'text' ? null : target,
    sub,
    overtime,
    offerFinishedAt: overtime && item.overMs >= FINISHED_EARLIER_MS && !fold,
    a11yLabel: spokenTags ? `${a11yLabel} ${spokenTags}.` : a11yLabel,
  };
}

export type HeroKind = 'startNow' | 'foldDone' | 'done' | 'finish';

export interface HeroModel {
  kind: HeroKind;
  label: string;
  a11yLabel: string;
  variant: 'primary' | 'tonal';
  size: 'hero' | 'lg';
}

/** The big button for an item, or null when the item is done. Multi-recipe labels carry the letter. */
export function heroFor(
  aggregate: BakeAggregate,
  item: ItemLive,
  multi: boolean,
): HeroModel | null {
  const current = item.current;
  if (!current || item.phase === 'done') return null;
  const next = item.next ? labelFor(aggregate, item.next) : '';
  const step = labelFor(aggregate, current);
  const vars = { letter: item.letter, next, step, recipe: item.name };

  if (item.phase === 'waiting') {
    return {
      kind: 'startNow',
      label: t(multi ? 'live.startNow.item' : 'live.startNow', vars),
      a11yLabel: t(multi ? 'live.startNow.a11y' : 'live.startNow', vars),
      variant: 'tonal',
      size: 'lg',
    };
  }
  if (item.phase === 'ready') {
    return {
      kind: 'finish',
      label: t(multi ? 'live.finish.item' : 'live.finish', vars),
      a11yLabel: t(multi ? 'live.finish.a11y' : 'live.finish', vars),
      variant: 'primary',
      size: 'hero',
    };
  }
  if (item.fold && item.fold.next !== null) {
    const fold = t('live.fold.done', { n: item.fold.next, count: item.fold.count });
    return {
      kind: 'foldDone',
      label: multi ? `${item.letter} · ${fold}` : fold,
      a11yLabel: multi ? `${fold} ${t('live.forRecipe', { recipe: item.name })}` : fold,
      variant: 'primary',
      size: 'hero',
    };
  }
  return {
    kind: 'done',
    label: item.isFinal
      ? t(multi ? 'live.doneFinal.item' : 'live.doneFinal', vars)
      : t(multi ? 'live.done.item' : 'live.done', vars),
    a11yLabel: item.isFinal
      ? t(multi ? 'live.doneFinal.a11y' : 'live.doneFinal', vars)
      : t(multi ? 'live.done.a11y' : 'live.done', vars),
    variant: 'primary',
    size: 'hero',
  };
}
