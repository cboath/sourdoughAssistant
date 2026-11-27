/**
 * The timeline view model (screens-bake.md 3.3, 4.3): rows for day headers, oven-slot headers,
 * steps, fold sub-rows and the final "Ready to eat" row, plus the lines of the "Worth a look"
 * card. Pure, so it is tested without rendering.
 */
import {
  zoneTransitionsBetween,
  type DurationChoice,
  type OvenSlot,
  type PlannedStep,
  type PlanWarning,
  type QuietHours,
  type StepTemplate,
} from '@sourdough/core';
import { t, tp } from '../../lib/i18n';
import { formatDuration, spokenDuration } from '../recipes/format';
import { letterFor, slotContents } from './labels';
import { overlapPartners } from './overlap';
import { isRangeStep, type Preview } from './preview';
import {
  formatClock,
  formatDayHeader,
  formatDayTime,
  formatMinuteOfDay,
  formatMonthDay,
  formatPlanRange,
  formatTemperature,
  localDateKey,
  type TimeContext,
} from './time';
import type { IconName } from '../../ui/components/Icon';
import type { StatusTone } from '../../ui/components/StatusTag';

export interface TimelineItem {
  itemId: string;
  name: string;
  steps: readonly StepTemplate[];
  loaves: number;
}

export interface TimelineContext {
  time: TimeContext;
  unit: 'C' | 'F';
  kitchenTempC: number | null;
  quiet: QuietHours;
  expandedFolds: ReadonlySet<string>;
}

export interface TagModel {
  id: string;
  kind: 'quietHours' | 'overlap' | 'dst' | 'adjusted' | 'capped' | 'hold' | 'noReminder';
  text: string;
  icon: IconName;
  tone: StatusTone;
}

export interface SliderModel {
  itemId: string;
  stepId: string;
  min: number;
  max: number;
  value: number;
  /** The recipe default, marked on the track. */
  recipeDefault: number;
  /** What "Use default" returns to: the recipe default, or the temperature-adjusted value. */
  baseValue: number;
  isUser: boolean;
  /** A slider value is hiding a temperature adjustment (screens-bake.md 3.3). */
  overridesTemp: boolean;
}

export type TimelineRow =
  | { type: 'day'; id: string; text: string }
  | { type: 'slot'; id: string; text: string; label: string }
  | {
      type: 'step';
      id: string;
      time: string;
      name: string;
      /** "Country loaf" or "Oven" in a multi-recipe bake. */
      prefix: string | null;
      letter: string | null;
      /** Position of the recipe in the bake (series color); 0 for single-recipe bakes. */
      itemIndex: number;
      ovenIcon: boolean;
      alongside: boolean;
      meta: string;
      tags: TagModel[];
      slider: SliderModel | null;
      foldCount: number;
      foldsExpanded: boolean;
      label: string;
    }
  | { type: 'fold'; id: string; text: string; tags: TagModel[]; label: string }
  | { type: 'final'; id: string; time: string; label: string };

export type WarningLineKind = 'quiet' | 'overlap' | 'dst' | 'temp' | 'hold';

export interface WarningLine {
  id: string;
  kind: WarningLineKind;
  icon: IconName;
  tone: StatusTone;
  text: string;
  hint?: string;
  /** The first row this warning applies to (scroll target). */
  rowId: string;
}

export interface TimelineModel {
  rows: TimelineRow[];
  warningLines: WarningLine[];
  /** Quiet-hours step count, for tests and the announcement. */
  quietCount: number;
}

const warningsFor = <C extends PlanWarning['code']>(
  warnings: readonly PlanWarning[],
  code: C,
  key: string,
) =>
  warnings.filter(
    (w): w is Extract<PlanWarning, { code: C }> =>
      w.code === code && 'stepKey' in w && w.stepKey === key,
  );

export function buildTimeline(
  preview: Preview,
  items: readonly TimelineItem[],
  ctx: TimelineContext,
): TimelineModel {
  const plan = preview.plan;
  if (!plan) return { rows: [], warningLines: [], quietCount: 0 };
  const { locale } = ctx.time;
  const multiRecipe = items.length > 1;
  const showSlots = multiRecipe || plan.slots.length > 1;
  const itemIndexById = new Map(items.map((item, index) => [item.itemId, index]));
  const stepByKey = new Map(plan.steps.map((s) => [s.key, s]));
  const partners = overlapPartners(preview.overlaps);
  const tempText = ctx.kitchenTempC === null ? '' : formatTemperature(ctx.kitchenTempC, ctx.unit);

  const rows: TimelineRow[] = [];
  const firstRow: Partial<Record<WarningLineKind, string>> = {};
  const note = (kind: WarningLineKind, rowId: string) => {
    if (!firstRow[kind]) firstRow[kind] = rowId;
  };

  let day = '';
  const pushDay = (at: number) => {
    const key = localDateKey(at, ctx.time.zone);
    if (key === day) return;
    day = key;
    rows.push({ type: 'day', id: `day:${key}`, text: formatDayHeader(at, ctx.time) });
  };

  const slotsSeen = new Set<number>();
  const slotById = new Map<number, OvenSlot>(plan.slots.map((s) => [s.index, s]));

  for (const step of plan.steps) {
    pushDay(step.startAt);
    if (showSlots && step.slotIndex !== null && !slotsSeen.has(step.slotIndex)) {
      slotsSeen.add(step.slotIndex);
      const slot = slotById.get(step.slotIndex);
      if (slot) {
        const contents = slotContents(slot, multiRecipe, itemIndexById);
        const time = formatClock(slot.startAt, ctx.time.zone, locale);
        rows.push({
          type: 'slot',
          id: `slot:${slot.index}`,
          text: t('plan.slot.header', { n: slot.index, contents, time }),
          label: t('plan.slot.label', { n: slot.index, contents, time }),
        });
      }
    }
    rows.push(stepRow(step));
    if (step.folds.length > 0 && ctx.expandedFolds.has(step.key)) {
      for (const fold of step.folds) {
        // Fold 1 shares the step start, so its quiet-hours warning is the step's own.
        const quiet =
          fold.index === 1
            ? warningsFor(preview.warnings, 'quietHours', step.key).some(
                (w) => w.foldIndex === undefined,
              )
            : warningsFor(preview.warnings, 'quietHours', step.key).some(
                (w) => w.foldIndex === fold.index,
              );
        const tags: TagModel[] = quiet ? [quietTag(`${step.key}:f${fold.index}`)] : [];
        const text = t('plan.fold', { n: fold.index });
        const time = formatClock(fold.at, ctx.time.zone, locale);
        rows.push({
          type: 'fold',
          id: `${step.key}:fold:${fold.index}`,
          text: `${text} · ${time}`,
          tags,
          label: [`${text}, ${time}`, ...tags.map((tag) => tag.text)].join('. '),
        });
      }
    }
  }

  pushDay(plan.readyAt);
  rows.push({
    type: 'final',
    id: 'final',
    time: formatClock(plan.readyAt, ctx.time.zone, locale),
    label: `${t('plan.readyToEat')}. ${formatDayTime(plan.readyAt, ctx.time, true)}.`,
  });

  function quietTag(id: string): TagModel {
    return { id, kind: 'quietHours', text: t('tag.quietHours'), icon: 'moon', tone: 'info' };
  }

  function stepRow(step: PlannedStep): TimelineRow {
    const itemIndex = step.itemId ? (itemIndexById.get(step.itemId) ?? -1) : -1;
    const item = itemIndex >= 0 ? items[itemIndex] : undefined;
    const template = item?.steps.find((s) => s.id === step.stepId);
    const choice: DurationChoice | undefined = step.stepId
      ? preview.choices[itemIndex]?.[step.stepId]
      : undefined;
    const duration = formatDuration(step.durationMin, locale);
    const range = formatPlanRange(step.minMin, step.maxMin, locale);

    const slider: SliderModel | null =
      template && item && step.stepId && isRangeStep(template) && !step.isAlongside
        ? {
            itemId: item.itemId,
            stepId: step.stepId,
            min: template.minMin,
            max: template.maxMin,
            value: step.durationMin,
            recipeDefault: template.durationMin,
            baseValue:
              preview.baseChoices[itemIndex]?.[step.stepId]?.minutes ?? template.durationMin,
            isUser: choice?.source === 'user',
            overridesTemp:
              choice?.source === 'user' && ctx.kitchenTempC !== null && template.tempSensitive,
          }
        : null;

    // The same sentence twice: abbreviated for the eye, spelled out for the screen reader (DR2-25).
    const buildMeta = (dur: string, rng: string, spoken: boolean): string => {
      let text: string;
      if (step.isAlongside) {
        const anchor = step.anchor ? stepByKey.get(step.anchor.key) : undefined;
        text = t('plan.alongside', { anchor: anchor?.name ?? '', duration: dur });
      } else if (template?.folds) {
        text = tp('plan.meta.folds', template.folds.count, {
          interval: spoken
            ? spokenDuration(template.folds.intervalMin, locale)
            : formatDuration(template.folds.intervalMin, locale),
          duration: dur,
        });
      } else if (slider?.isUser) {
        text = t('plan.meta.user', { duration: dur, range: rng });
      } else if (step.minMin !== step.maxMin) {
        text = t('plan.meta.range', { duration: dur, range: rng });
      } else {
        text = t('plan.meta.fixed', { duration: dur });
      }
      if (showSlots && step.slotIndex !== null && step.loaves !== null) {
        text = `${tp('plan.slot.meta', step.loaves, { n: step.slotIndex })} · ${text}`;
      }
      return text;
    };
    const meta = buildMeta(duration, range, false);
    const spokenMeta = buildMeta(
      spokenDuration(step.durationMin, locale),
      t('plan.range.spoken', {
        min: spokenDuration(step.minMin, locale),
        max: spokenDuration(step.maxMin, locale),
      }),
      true,
    ).replace(/\s*·\s*/g, ', ');

    const tags: TagModel[] = [];
    if (
      warningsFor(preview.warnings, 'quietHours', step.key).some((w) => w.foldIndex === undefined)
    ) {
      tags.push(quietTag(`${step.key}:quiet`));
      note('quiet', step.key);
    }
    if (
      warningsFor(preview.warnings, 'quietHours', step.key).some((w) => w.foldIndex !== undefined)
    ) {
      note('quiet', step.key);
    }
    const partnerKey = partners.get(step.key);
    const partner = partnerKey ? stepByKey.get(partnerKey) : undefined;
    if (partner) {
      const partnerIndex = partner.itemId ? (itemIndexById.get(partner.itemId) ?? -1) : -1;
      tags.push({
        id: `${step.key}:overlap`,
        kind: 'overlap',
        text:
          partnerIndex >= 0
            ? t('tag.overlap', { letter: letterFor(partnerIndex), step: partner.name })
            : t('tag.overlapOven', { step: partner.name }),
        icon: 'people',
        tone: 'neutral',
      });
      note('overlap', step.key);
    }
    for (const w of warningsFor(preview.warnings, 'dstTransition', step.key)) {
      const amount = formatDuration(Math.abs(w.offsetChangeMin), locale);
      tags.push({
        id: `${step.key}:dst`,
        kind: 'dst',
        text: t(w.offsetChangeMin < 0 ? 'tag.dstBack' : 'tag.dstForward', { duration: amount }),
        icon: 'clock',
        tone: 'info',
      });
      note('dst', step.key);
    }
    const clamped = warningsFor(preview.warnings, 'temperatureClamped', step.key)[0];
    if (clamped) {
      tags.push({
        id: `${step.key}:capped`,
        kind: 'capped',
        text: t('tag.capped', {
          duration: formatDuration(clamped.minutes, locale),
          temp: tempText,
        }),
        icon: 'thermometer',
        tone: 'warning',
      });
      note('temp', step.key);
    } else if (choice?.source === 'temperature' && template) {
      tags.push({
        id: `${step.key}:adjusted`,
        kind: 'adjusted',
        text: t('tag.adjusted', {
          temp: tempText,
          duration: formatDuration(template.durationMin, locale),
        }),
        icon: 'thermometer',
        tone: 'neutral',
      });
    }
    const hold = warningsFor(preview.warnings, 'holdExceedsRange', step.key)[0];
    if (hold) {
      tags.push({
        id: `${step.key}:hold`,
        kind: 'hold',
        text: t('tag.hold', {
          effective: formatDuration(hold.effectiveMin, locale),
          max: formatDuration(hold.maxMin, locale),
        }),
        icon: 'alarm',
        tone: 'warning',
      });
      note('hold', step.key);
    }
    if (!step.notify) {
      tags.push({
        id: `${step.key}:noReminder`,
        kind: 'noReminder',
        text: t('tag.noReminder'),
        icon: 'bellOff',
        tone: 'neutral',
      });
    }

    const letter = item && multiRecipe ? letterFor(itemIndex) : null;
    const prefix = multiRecipe ? (item ? item.name : t('plan.oven.prefix')) : null;
    const when = formatDayTime(step.startAt, ctx.time, true);
    const label = [
      `${when}.`,
      `${prefix ? `${prefix}: ` : ''}${step.name}.`,
      `${spokenMeta}.`,
      ...tags.map((tag) => `${tag.text}.`),
      slider?.overridesTemp ? t('plan.slider.overridesTemp') : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      type: 'step',
      id: step.key,
      time: formatClock(step.startAt, ctx.time.zone, locale),
      name: step.name,
      prefix,
      letter,
      itemIndex: Math.max(0, itemIndex),
      ovenIcon: multiRecipe && !item,
      alongside: step.isAlongside,
      meta,
      tags,
      slider,
      foldCount: step.folds.length,
      foldsExpanded: ctx.expandedFolds.has(step.key),
      label,
    };
  }

  const quietCount = preview.warnings.filter((w) => w.code === 'quietHours').length;
  return {
    rows,
    quietCount,
    warningLines: buildWarningLines(preview, ctx, firstRow, stepByKey),
  };
}

function buildWarningLines(
  preview: Preview,
  ctx: TimelineContext,
  firstRow: Partial<Record<WarningLineKind, string>>,
  stepByKey: ReadonlyMap<string, PlannedStep>,
): WarningLine[] {
  const plan = preview.plan;
  if (!plan) return [];
  const { locale, zone } = ctx.time;
  const lines: WarningLine[] = [];

  const quiet = preview.warnings.filter((w) => w.code === 'quietHours');
  if (quiet.length > 0 && firstRow.quiet) {
    lines.push({
      id: 'quiet',
      kind: 'quiet',
      icon: 'moon',
      tone: 'info',
      text: tp('plan.quiet.summary', quiet.length, {
        from: formatMinuteOfDay(ctx.quiet.startMin, locale),
        to: formatMinuteOfDay(ctx.quiet.endMin, locale),
      }),
      hint: t('plan.quiet.hint'),
      rowId: firstRow.quiet,
    });
  }
  if (preview.overlaps.length > 0 && firstRow.overlap) {
    lines.push({
      id: 'overlap',
      kind: 'overlap',
      icon: 'people',
      tone: 'neutral',
      text: tp('plan.overlap.summary', preview.overlaps.length),
      rowId: firstRow.overlap,
    });
  }
  const transition = zoneTransitionsBetween(plan.startAt, plan.readyAt, zone)[0];
  if (transition && firstRow.dst) {
    lines.push({
      id: 'dst',
      kind: 'dst',
      icon: 'clock',
      tone: 'info',
      text: t('plan.dst.summary', { date: formatMonthDay(transition.at, zone, locale) }),
      rowId: firstRow.dst,
    });
  }
  for (const w of preview.warnings) {
    if (w.code !== 'temperatureClamped') continue;
    const step = stepByKey.get(w.stepKey);
    const cold = w.unclampedMinutes > w.minutes;
    lines.push({
      id: `temp:${w.stepKey}`,
      kind: 'temp',
      icon: 'thermometer',
      tone: 'warning',
      text: t(cold ? 'plan.tempCold.summary' : 'plan.tempWarm.summary', {
        step: step?.name ?? '',
        duration: formatDuration(w.minutes, locale),
      }),
      rowId: w.stepKey,
    });
  }
  for (const w of preview.warnings) {
    if (w.code !== 'holdExceedsRange') continue;
    const step = stepByKey.get(w.stepKey);
    // The loaves that wait longest are in the item's last slot.
    const lastSlot = Math.max(
      1,
      ...plan.steps
        .filter((s) => s.itemId === step?.itemId && s.slotIndex !== null)
        .map((s) => s.slotIndex ?? 1),
    );
    lines.push({
      id: `hold:${w.stepKey}`,
      kind: 'hold',
      icon: 'alarm',
      tone: 'warning',
      text: t('plan.hold.summary', {
        slot: lastSlot,
        effective: formatDuration(w.effectiveMin, locale),
        max: formatDuration(w.maxMin, locale),
      }),
      rowId: w.stepKey,
    });
  }
  return lines;
}
