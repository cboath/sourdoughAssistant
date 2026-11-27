/** The "Ready to eat" summary: when it started, how long it took, and the cost from the snapshot. */
import { formatMoney } from '@sourdough/core';
import { z } from 'zod';
import type { BakeAggregate } from '../../db/types';
import { t } from '../../lib/i18n';
import { formatSpan, formatDayTime } from '../schedule/time';
import type { TimeCtx } from './ready';

// The cost snapshot's breakdown is opaque to the database layer, so it is validated here.
const breakdownSchema = z.object({
  perLoafCents: z.number().int().min(0),
  complete: z.boolean(),
});

export interface CompleteSummary {
  body: string;
  /** One line per recipe, "Cost $1.39 per loaf" or "Cost incomplete". Empty without snapshots. */
  costLines: Array<{ name: string | null; text: string }>;
}

export function completeSummary(aggregate: BakeAggregate, ctx: TimeCtx): CompleteSummary {
  const { bake } = aggregate;
  const started = Date.parse(
    bake.startedAt ?? aggregate.steps[0]?.plannedStartAt ?? bake.createdAt,
  );
  const ended = Date.parse(bake.completedAt ?? bake.plannedReadyAt);
  const minutes = Math.max(0, Math.round((ended - started) / 60_000));
  const multi = aggregate.items.length > 1;
  const costLines: CompleteSummary['costLines'] = [];
  for (const item of aggregate.items) {
    if (!item.costSnapshot) continue;
    const parsed = breakdownSchema.safeParse(item.costSnapshot.breakdown);
    if (!parsed.success) continue;
    const text = parsed.data.complete
      ? t('live.complete.cost', {
          perLoaf: formatMoney(
            parsed.data.perLoafCents,
            item.costSnapshot.currencyCode,
            ctx.locale,
          ),
        })
      : t('live.complete.costIncomplete');
    costLines.push({ name: multi ? item.recipeSnapshot.recipe.name : null, text });
  }
  return {
    body: t('live.complete.body', {
      dayTime: formatDayTime(started, ctx),
      span: formatSpan(minutes, ctx.locale),
    }),
    costLines,
  };
}
