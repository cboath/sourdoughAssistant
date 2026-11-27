import { useRef, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { fromIso, isInQuietHours, type QuietHours } from '@sourdough/core';
import type { BakeAggregate, BakeStep } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { Button, Icon, SectionHeader, StatusTag, Text } from '../../../ui/components';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import { useScreenMargin } from '../../../ui/hooks/useScreenMargin';
import { useTheme } from '../../../ui/theme';
import { formatDuration, spokenDuration } from '../../recipes/format';
import { LetterBadge } from '../../schedule/components/LetterBadge';
import { letterFor } from '../../schedule/labels';
import { formatClock, formatDayTime } from '../../schedule/time';
import type { RowState } from '../derive';
import { labelFor } from '../panel';
import type { TimeCtx } from '../ready';

const MIN_MS = 60_000;

export interface AlsoNowProps {
  rows: readonly BakeStep[];
  aggregate: BakeAggregate;
  ctx: TimeCtx;
  multi: boolean;
  busy: boolean;
  onDone: (row: BakeStep) => void;
}

/** Alongside steps and the bake-wide preheat that are due, each with its own large Done. */
export function AlsoNowSection({ rows, aggregate, ctx, multi, busy, onDone }: AlsoNowProps) {
  const { space, size } = useTheme();
  const margin = useScreenMargin();
  if (rows.length === 0) return null;
  return (
    <View>
      <SectionHeader title={t('live.alsoNow')} />
      {rows.map((row) => {
        const end = fromIso(row.plannedEndAt);
        const name = labelFor(aggregate, row);
        const detail =
          end > ctx.now
            ? t('live.alsoNow.left', {
                duration: formatDuration(Math.ceil((end - ctx.now) / MIN_MS), ctx.locale),
              })
            : t('live.alsoNow.due', { time: formatClock(end, ctx.zone, ctx.locale) });
        const spoken =
          end > ctx.now
            ? t('live.alsoNow.left', {
                duration: spokenDuration(Math.ceil((end - ctx.now) / MIN_MS), ctx.locale),
              })
            : detail;
        const index = aggregate.items.findIndex((i) => i.id === row.bakeItemId);
        return (
          <View
            key={row.id}
            testID={`also-${row.id}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingLeft: margin.left,
              paddingRight: margin.right,
              paddingVertical: space.sm,
              minHeight: size.touchKitchen,
            }}
          >
            <View
              accessible
              accessibilityLabel={t('live.alsoNow.row', { step: name, detail: spoken })}
              style={{ flex: 1, gap: space.xs }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {multi && index >= 0 ? (
                  <LetterBadge letter={letterFor(index)} index={index} />
                ) : null}
                <Text variant="headline" style={{ flexShrink: 1 }}>
                  {name}
                </Text>
              </View>
              <Text variant="subhead" color="textSecondary">
                {detail}
              </Text>
            </View>
            <Button
              variant="tonal"
              size="lg"
              leadingIcon="check"
              label={t('live.alsoNow.done')}
              accessibilityLabel={t('live.alsoNow.doneLabel', { step: name })}
              disabled={busy}
              onPress={() => onDone(row)}
              testID={`also-done-${row.id}`}
            />
          </View>
        );
      })}
    </View>
  );
}

export interface ComingUpEntry {
  step: BakeStep;
  state: RowState;
}

export interface ComingUpProps {
  entries: readonly ComingUpEntry[];
  aggregate: BakeAggregate;
  ctx: TimeCtx;
  quiet: QuietHours;
  multi: boolean;
  expanded: boolean;
  /** Only worth a toggle when there is more than the preview shows. */
  canExpand: boolean;
  onToggle: () => void;
  highlightId: string | null;
  /** The step a link or notification pointed at, for scrolling to it. */
  onRowLayout: (stepId: string, y: number) => void;
  focusRef: (stepId: string) => ((node: ComponentRef<typeof View> | null) => void) | undefined;
  /** "Times below update when you tap Done" under long overtime. */
  stale: boolean;
}

/** The next three steps (or all of them, done ones included) with clock times. */
export function ComingUpSection({
  entries,
  aggregate,
  ctx,
  quiet,
  multi,
  expanded,
  canExpand,
  onToggle,
  highlightId,
  onRowLayout,
  focusRef,
  stale,
}: ComingUpProps) {
  const { space, color, size, layout } = useTheme();
  const { stacked } = useFontScale();
  const margin = useScreenMargin();
  if (entries.length === 0 && !canExpand) return null;
  return (
    <View>
      <SectionHeader title={t('live.comingUp')} />
      {stale ? (
        <Text
          variant="footnote"
          color="textSecondary"
          style={{ paddingLeft: margin.left, paddingRight: margin.right, paddingBottom: space.sm }}
        >
          {t('live.stale')}
        </Text>
      ) : null}
      {entries.map(({ step, state }) => {
        const start = fromIso(step.plannedStartAt);
        const name = labelFor(aggregate, step);
        const index = aggregate.items.findIndex((i) => i.id === step.bakeItemId);
        const done = state === 'done' || state === 'inferred';
        const quietTag =
          state === 'upcoming' && step.notify && isInQuietHours(start, quiet, ctx.zone);
        let time: string;
        let spokenState: string;
        let meta: string | null = null;
        if (state === 'done') {
          const at = step.actualEndAt ? fromIso(step.actualEndAt) : fromIso(step.plannedEndAt);
          time = t('live.row.doneAt', { time: formatClock(at, ctx.zone, ctx.locale) });
          spokenState = t('live.row.done', {
            step: name,
            time: formatClock(at, ctx.zone, ctx.locale),
          });
        } else if (state === 'inferred') {
          time = '';
          meta = t('live.row.inferredMeta');
          spokenState = t('live.row.inferred', { step: name });
        } else if (state === 'notMarked') {
          time = formatClock(start, ctx.zone, ctx.locale);
          meta = t('live.row.notMarkedMeta');
          spokenState = t('live.row.notMarked', { step: name });
        } else if (state === 'current' || state === 'overtime') {
          time = t('live.row.now');
          spokenState = t(state === 'overtime' ? 'live.row.overtime' : 'live.row.current', {
            step: name,
          });
        } else {
          time = formatDayTimeShort(start, ctx);
          spokenState = t('live.row.upcoming', {
            step: name,
            time: formatDayTime(start, ctx, true),
          });
        }
        const moved =
          state === 'upcoming' &&
          Math.abs(start - fromIso(step.originalPlannedStartAt)) >= 5 * MIN_MS
            ? t('live.row.moved', {
                time: formatClock(fromIso(step.originalPlannedStartAt), ctx.zone, ctx.locale),
              })
            : null;
        const label = [
          multi && step.bakeItemId
            ? `${aggregate.items[index]?.recipeSnapshot.recipe.name ?? ''}: ${spokenState}`
            : spokenState,
          quietTag ? t('status.quietHours') : '',
        ]
          .filter(Boolean)
          .join('. ');
        return (
          <View
            key={step.id}
            testID={`coming-${step.id}`}
            ref={focusRef(step.id)}
            onLayout={(e: LayoutChangeEvent) => onRowLayout(step.id, e.nativeEvent.layout.y)}
            accessible
            accessibilityLabel={label}
            style={{
              flexDirection: stacked ? 'column' : 'row',
              gap: space.sm,
              paddingLeft: margin.left,
              paddingRight: margin.right,
              paddingVertical: space.sm,
              backgroundColor: highlightId === step.id ? color.accentContainer : 'transparent',
            }}
          >
            <Text
              variant="subhead"
              numeric
              color="textSecondary"
              style={stacked ? undefined : { width: layout.timelineTimeColumn }}
            >
              {time}
            </Text>
            <View style={{ flex: 1, gap: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {done ? <Icon name="check" size={size.iconSm} color="success" /> : null}
                {multi && index >= 0 ? (
                  <LetterBadge letter={letterFor(index)} index={index} />
                ) : null}
                <Text variant="headline" style={{ flexShrink: 1 }}>
                  {name}
                </Text>
              </View>
              {meta ? (
                <Text variant="subhead" color="textSecondary">
                  {meta}
                </Text>
              ) : null}
              {moved ? (
                <Text variant="subhead" color="textSecondary">
                  {moved}
                </Text>
              ) : null}
              {quietTag ? <StatusTag variant="quietHours" /> : null}
            </View>
          </View>
        );
      })}
      {canExpand ? (
        <View style={{ paddingLeft: margin.left, paddingRight: margin.right }}>
          <Button
            variant="text"
            size="lg"
            label={t(expanded ? 'live.showLess' : 'live.showAll')}
            onPress={onToggle}
            expanded={expanded}
            testID="coming-up-toggle"
          />
        </View>
      ) : null}
    </View>
  );
}

/** Clock time, with the day when it isn't today ("Sat 6:05 AM"). */
function formatDayTimeShort(at: number, ctx: TimeCtx): string {
  const full = formatDayTime(at, ctx);
  const clock = formatClock(at, ctx.zone, ctx.locale);
  return full.startsWith(t('time.today')) ? clock : full;
}

/** Keeps a stable ref callback per step id, for the accessibility focus on a linked step. */
export function useFocusRefs() {
  const nodes = useRef(new Map<string, ComponentRef<typeof View>>());
  return {
    nodes,
    focusRef: (id: string) => (node: ComponentRef<typeof View> | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
  };
}
