import { Platform, View } from 'react-native';
import { formatMoney } from '@sourdough/core';
import { t, tp } from '../../../lib/i18n';
import { Card, Icon, StatusTag, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { formatRatioPercent } from '../../recipes/format';
import type { PriceContext } from '../../pantry/format';
import type { CostView } from '../compute';
import { lineValueSpoken, lineValueText } from '../text';

const TOP_LINES = 4;

export interface CostCardProps {
  view: CostView;
  ctx: PriceContext;
  /** Number of ingredient lines in the recipe (0 shows the empty wording). */
  lineCount: number;
  onPress: () => void;
}

/** The tappable cost summary on the recipe detail screen (screens-recipes.md section 10.2 item 6). */
export function CostCard({ view, ctx, lineCount, onPress }: CostCardProps) {
  const { space } = useTheme();
  const { breakdown, sellCents, topLines } = view;
  const money = (cents: number) => formatMoney(cents, ctx.currency, ctx.locale);
  const loavesText = tp('recipes.row.loaves', view.loaves);
  const pricedAny = breakdown.lines.some((l) => l.status === 'priced' || l.status === 'free');
  const missing = breakdown.incompleteLineIds.length;
  const shown = topLines.slice(0, TOP_LINES);
  const more = topLines.length - shown.length;

  const biggest = shown
    .map((l) =>
      [
        l.source.name,
        lineValueSpoken(l, ctx),
        l.cost.sharePct !== null ? formatRatioPercent(l.cost.sharePct, 100, ctx.locale) : null,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('; ');
  const label = [
    lineCount === 0
      ? t('detail.cost.noIngredients')
      : t('detail.cost.label', {
          perLoaf: money(breakdown.perLoafCents),
          batch: t('detail.cost.batch', { money: money(breakdown.batchCents), loaves: loavesText }),
        }),
    sellCents !== null ? t('detail.cost.labelSell', { sell: money(sellCents) }) : '',
    biggest ? t('detail.cost.labelBiggest', { lines: biggest }) : '',
    !breakdown.complete && lineCount > 0 ? t('detail.cost.incomplete') : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={t('detail.cost.hint')}
      testID="cost-card"
    >
      <View style={{ gap: space.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="title3" heading>
            {t('detail.cost')}
          </Text>
          {Platform.OS === 'ios' ? <Icon name="chevronRight" color="textSecondary" /> : null}
        </View>
        {lineCount === 0 ? (
          <Text color="textSecondary">{t('detail.cost.noIngredients')}</Text>
        ) : !pricedAny ? (
          <>
            <Text variant="title3">{t('detail.cost.none')}</Text>
            <Text color="textSecondary">{t('detail.cost.noneBody')}</Text>
          </>
        ) : (
          <>
            <Text variant="title2" numeric>
              {t(breakdown.complete ? 'detail.cost.perLoaf' : 'detail.cost.perLoafPartial', {
                money: money(breakdown.perLoafCents),
              })}
            </Text>
            <Text variant="subhead" color="textSecondary" numeric>
              {t('detail.cost.batch', { money: money(breakdown.batchCents), loaves: loavesText })}
            </Text>
            {breakdown.complete && sellCents !== null ? (
              <Text variant="callout" numeric>
                {t('detail.cost.sell', { money: money(sellCents) })}
              </Text>
            ) : null}
            {!breakdown.complete ? (
              <View style={{ gap: space.xs }}>
                <StatusTag variant="unpriced" text={t('detail.cost.incomplete')} />
                <Text variant="footnote" color="textSecondary">
                  {tp('detail.cost.missing', missing)}
                </Text>
              </View>
            ) : null}
            {shown.map((l) => (
              <View key={l.cost.lineId} style={{ gap: space.xs }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}
                >
                  <Text variant="subhead" numeric style={{ flexShrink: 1 }}>
                    {l.source.name} · {lineValueText(l, ctx)}
                  </Text>
                  <Text variant="subhead" numeric color="textSecondary">
                    {l.cost.sharePct !== null
                      ? formatRatioPercent(l.cost.sharePct, 100, ctx.locale)
                      : '–'}
                  </Text>
                </View>
                <ShareBar pct={l.cost.sharePct ?? 0} />
              </View>
            ))}
            {more > 0 ? (
              <Text variant="footnote" color="textSecondary">
                {t('detail.cost.more', { count: more })}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

/** Decorative share bar (hidden from screen readers). */
export function ShareBar({ pct }: { pct: number }) {
  const { color, space, radius } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        height: space.xs,
        borderRadius: radius.full,
        backgroundColor: color.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          backgroundColor: color.accent,
        }}
      />
    </View>
  );
}
