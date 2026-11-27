/**
 * The Bakes home card as text (screens-bake.md 1.2, 1.6): a pure view model so wording, order and
 * the spoken label are tested without rendering.
 */
import { fromIso } from '@sourdough/core';
import type { BakeAggregate } from '../../db/types';
import { t, tp } from '../../lib/i18n';
import { formatDuration, spokenDuration } from '../recipes/format';
import { formatClock, formatDayTime } from '../schedule/time';
import type { BakeLive } from './derive';
import { cardLeft, cardOver, deltaText, spokenCountdown } from './format';
import { labelFor } from './panel';
import type { TimeCtx } from './ready';

const MIN_MS = 60_000;

/** The reminder state a card keeps visible even after its banner was dismissed (DR2-04). */
export type CardReminders = 'off' | 'late' | null;

export type CardVariant = 'active' | 'overtime' | 'upcoming' | 'ready';

export interface CardModel {
  variant: CardVariant;
  /** Visible names with letters for multi-recipe bakes. */
  title: string;
  /** Per-item entries, for rendering letter badges. */
  recipes: Array<{ letter: string; name: string; index: number }>;
  /** The line under the title: the current step, "Starts ...", or "Ready to eat". */
  headline: string;
  /** "2 h 14 min left" or "+12 min over"; null when there is none. */
  countdown: string | null;
  overtime: boolean;
  /** `subhead` lines, in order. */
  lines: string[];
  progress: number | null;
  progressLabel: string | null;
  reminders: CardReminders;
  a11yLabel: string;
}

const MORE_THAN = 2;

export function cardFor(
  aggregate: BakeAggregate,
  live: BakeLive,
  ctx: TimeCtx,
  reminders: CardReminders = null,
): CardModel {
  const withReminders = (model: Omit<CardModel, 'reminders'>): CardModel => ({
    ...model,
    reminders,
    a11yLabel: reminders
      ? `${model.a11yLabel}. ${t(reminders === 'off' ? 'home.card.remindersOffSpoken' : 'home.card.remindersLateSpoken')}`
      : model.a11yLabel,
  });
  const { zone, locale, now } = ctx;
  const multi = live.items.length > 1;
  const recipes = live.items.map((i) => ({ letter: i.letter, name: i.name, index: i.index }));
  const fullTitle = multi
    ? recipes.map((r) => `${r.letter} ${r.name}`).join(' · ')
    : (recipes[0]?.name ?? '');
  const title =
    multi && recipes.length > MORE_THAN
      ? t('home.card.moreRecipes', {
          first: `${recipes[0]?.letter} ${recipes[0]?.name}`,
          count: recipes.length - 1,
        })
      : fullTitle;
  const spokenNames = recipes.map((r) => r.name).join(` ${t('home.card.and')} `);

  const variant: CardVariant =
    live.phase === 'waiting'
      ? 'upcoming'
      : live.phase === 'ready'
        ? 'ready'
        : live.phase === 'overtime'
          ? 'overtime'
          : 'active';

  const readyLine = (() => {
    const deltaMin = Math.round((live.readyAt - live.originalReadyAt) / MIN_MS);
    const dayTime = formatDayTime(live.readyAt, ctx);
    return Math.abs(deltaMin) >= 5
      ? t('home.card.readyMoved', { dayTime, delta: deltaText(deltaMin, locale) })
      : t('home.card.ready', { dayTime });
  })();
  const spokenReady = t('home.card.ready', { dayTime: formatDayTime(live.readyAt, ctx, true) });

  if (variant === 'upcoming') {
    const first = live.first;
    const start = first ? fromIso(first.plannedStartAt) : live.startAt;
    const untilMs = start - now;
    const headline =
      untilMs < 60 * MIN_MS
        ? t('home.card.startsIn', {
            duration: formatDuration(Math.max(1, Math.ceil(untilMs / MIN_MS)), locale),
          })
        : t('home.card.starts', { dayTime: formatDayTime(start, ctx) });
    const spokenHeadline =
      untilMs < 60 * MIN_MS
        ? t('home.card.startsIn', {
            duration: spokenDuration(Math.max(1, Math.ceil(untilMs / MIN_MS)), locale),
          })
        : t('home.card.starts', { dayTime: formatDayTime(start, ctx, true) });
    const firstLine = t('home.card.first', {
      step: first ? labelFor(aggregate, first) : '',
      dayTime: formatDayTime(live.readyAt, ctx),
    });
    return withReminders({
      variant,
      title,
      recipes,
      headline,
      countdown: null,
      overtime: false,
      lines: [firstLine],
      progress: null,
      progressLabel: null,
      a11yLabel: [
        spokenNames,
        spokenHeadline,
        `${first ? labelFor(aggregate, first) : ''}. ${spokenReady}`,
      ].join('. '),
    });
  }

  if (variant === 'ready') {
    return withReminders({
      variant,
      title,
      recipes,
      headline: t('home.card.readyNow'),
      countdown: null,
      overtime: false,
      lines: [t('home.card.readyTap')],
      progress: 1,
      progressLabel: t('home.card.progress', { percent: 100 }),
      a11yLabel: [spokenNames, t('home.card.readyNow'), t('home.card.readyTap')].join('. '),
    });
  }

  const item = live.urgent ?? live.items.find((i) => i.phase !== 'done');
  const current = item?.current ?? null;
  const stepName = current ? labelFor(aggregate, current) : '';
  const fold = item?.fold;
  const headline =
    fold && fold.next !== null
      ? t('home.card.fold', { step: stepName, n: fold.next, count: fold.count })
      : stepName;
  const overtime = item?.phase === 'overtime';
  const target = item?.targetAt ?? now;
  const countdown = overtime
    ? cardOver(item?.overMs ?? 0, locale)
    : cardLeft(Math.max(0, target - now), locale);
  const spokenCount = overtime
    ? `${spokenCountdown(item?.overMs ?? 0, locale)} ${t('home.card.overSpoken')}`
    : `${spokenCountdown(Math.max(0, target - now), locale)} ${t('live.panel.left')}`;

  const others = live.items.filter(
    (i) => i !== item && (i.phase === 'running' || i.phase === 'overtime'),
  ).length;
  const lines: string[] = [];
  const spoken: string[] = [spokenNames];
  spoken.push(`${stepName}, ${spokenCount}`);
  if (others > 0) {
    const more = tp('home.card.moreNow', others);
    lines.push(more);
    spoken.push(more);
  }
  const next = live.next;
  if (next) {
    const nextLine = t('home.card.next', {
      step: labelFor(aggregate, next),
      time: formatClock(fromIso(next.plannedStartAt), zone, locale),
    });
    lines.push(nextLine);
    spoken.push(nextLine);
  }
  lines.push(readyLine);
  spoken.push(spokenReady);
  const percent = Math.round(live.progress * 100);
  spoken.push(t('home.card.progress', { percent }));

  return withReminders({
    variant,
    title,
    recipes,
    headline,
    countdown,
    overtime,
    lines,
    progress: live.progress,
    progressLabel: t('home.card.progress', { percent }),
    a11yLabel: spoken.join('. '),
  });
}
