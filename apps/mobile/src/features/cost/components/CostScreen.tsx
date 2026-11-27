import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { currencyMinorDigits, formatMoney } from '@sourdough/core';
import type { PantryItem } from '../../../db/types';
import { t, tp } from '../../../lib/i18n';
import { flags } from '../../../lib/flags';
import { routes } from '../../../lib/nav';
import {
  Banner,
  Button,
  Card,
  ContentColumn,
  Divider,
  EmptyState,
  SectionHeader,
  Skeleton,
  Stepper,
  StatusTag,
  Text,
} from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import { useTheme } from '../../../ui/theme';
import { PriceUpdateSheet } from '../../pantry/components/PriceUpdateSheet';
import { formatPercent, formatRatioPercent, speakable } from '../../recipes/format';
import { useCostSettings } from '../../recipes/hooks/useRecipeData';
import type { CostLineView } from '../compute';
import { useDisplayContext } from '../hooks/useDisplayContext';
import { useRecipeCost } from '../hooks/useRecipeCost';
import { lineDetailText, lineValueSpoken, lineValueText } from '../text';
import { ShareBar } from './CostCard';

/** RECIPE-COST (screens-recipes.md section 11). */
export function CostScreen({ id, loaves }: { id: string; loaves?: number }) {
  const router = useRouter();
  const { space } = useTheme();
  const { stacked } = useFontScale();
  const display = useDisplayContext();
  const settings = useCostSettings();
  const [override, setOverride] = useState<number | undefined>(loaves);
  const cost = useRecipeCost(id, override);
  const [priceTarget, setPriceTarget] = useState<PantryItem | null>(null);

  const view = cost.view;
  const aggregate = cost.aggregate;
  const money = (cents: number) => formatMoney(cents, display.currency, display.locale);

  const names = useMemo(() => {
    if (!view) return { unpriced: [] as CostLineView[], convert: [] as CostLineView[] };
    return {
      unpriced: view.lines.filter((l) => l.cost.status === 'unpriced'),
      convert: view.lines.filter((l) => l.cost.status === 'conversionError'),
    };
  }, [view]);

  if (cost.isPending) {
    return (
      <ContentColumn>
        <Skeleton rows={5} />
      </ContentColumn>
    );
  }
  if (cost.isError) {
    return (
      <EmptyState
        variant="error"
        title={t('cost.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void cost.refetch() }}
      />
    );
  }
  if (!aggregate || !view) {
    return (
      <EmptyState
        variant="error"
        title={t('detail.gone')}
        action={{ label: t('detail.backToRecipes'), onPress: () => router.replace(routes.recipes) }}
      />
    );
  }

  const { recipe } = aggregate;
  const { breakdown } = view;
  const count = view.loaves;
  const partial = !breakdown.complete;
  const loavesText = tp('recipes.row.loaves', count);
  const zeroBatch = breakdown.complete && breakdown.batchCents === 0;

  const listNames = (lines: CostLineView[]): string => {
    const first = lines.slice(0, 3).map((l) => l.source.name);
    const joined = new Intl.ListFormat(display.locale, {
      style: 'long',
      type: 'conjunction',
    }).format(first);
    return lines.length > 3
      ? t('cost.incomplete.more', { names: first.join(', '), count: lines.length - 3 })
      : joined;
  };

  const affected = names.unpriced.length + names.convert.length;
  const single = affected === 1 ? (names.unpriced[0] ?? names.convert[0]) : undefined;
  const actionFor = (line: CostLineView) => {
    if (line.cost.status === 'unpriced') {
      if (!line.item) {
        return {
          label: t('cost.linkInRecipe'),
          a11y: t('cost.linkInRecipe'),
          run: () => router.push(routes.recipeEditor(id)),
        };
      }
      const item = line.item;
      return {
        label: t('cost.addPrice'),
        a11y: t('cost.addPriceFor', { item: item.name }),
        run: () => setPriceTarget(item),
      };
    }
    if (line.cost.status === 'conversionError' && line.item) {
      const item = line.item;
      const each = line.cost.conversionError?.code === 'missingEachWeight';
      return {
        label: t(each ? 'cost.addEach' : 'cost.addDensity'),
        a11y: `${t(each ? 'cost.addEach' : 'cost.addDensity')}, ${item.name}`,
        run: () =>
          router.push(
            routes.pantryEditor(item.id, `?focus=${each ? 'gramsPerEach' : 'gramsPerCup'}`),
          ),
      };
    }
    return null;
  };

  const markupText = formatPercent(
    settings.markupBps / 100,
    display.locale,
    settings.markupBps % 100 === 0 ? 0 : 1,
  );
  const stepText = settings.sellRoundingCents > 0 ? money(settings.sellRoundingCents) : null;
  const anyBelow = view.lines.some((l) => l.cost.belowOneCent);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Stack.Screen options={{ title: t('cost.title') }} />
      <ContentColumn style={{ paddingTop: space.lg, gap: space.lg }}>
        <Text variant="subhead" color="textSecondary">
          {t('cost.context', { name: recipe.name, loaves: loavesText })}
        </Text>
        <View style={{ gap: space.xs }}>
          <Text variant="subhead" accessible={false} importantForAccessibility="no">
            {t('cost.loaves')}
          </Text>
          <Stepper
            label={t('cost.loaves')}
            value={count}
            min={1}
            max={50}
            onChange={(n) => {
              haptic('selection');
              setOverride(n);
            }}
            formatValue={(n) => tp('recipes.row.loaves', n)}
            testID="cost-loaves"
          />
          {count !== recipe.yieldLoaves ? (
            <Text variant="footnote" color="textSecondary">
              {t('cost.recipeMakes', { loaves: tp('recipes.row.loaves', recipe.yieldLoaves) })}
            </Text>
          ) : null}
        </View>

        {names.unpriced.length > 0 ? (
          <Banner
            variant="warning"
            message={tp('cost.incomplete.banner', names.unpriced.length, {
              names: listNames(names.unpriced),
            })}
            actions={
              single && single.cost.status === 'unpriced' && actionFor(single)
                ? [
                    {
                      label: actionFor(single)?.label ?? '',
                      onPress: () => actionFor(single)?.run(),
                    },
                  ]
                : undefined
            }
            testID="incomplete-banner"
          />
        ) : null}
        {names.convert.map((line) => {
          const each = line.cost.conversionError?.code === 'missingEachWeight';
          const action = single === line ? actionFor(line) : null;
          return (
            <Banner
              key={line.cost.lineId}
              variant="warning"
              message={t('cost.convert.banner', {
                name: line.source.name,
                unit: line.item?.packageUnit ?? '',
                need: t(each ? 'cost.need.each' : 'cost.need.density'),
              })}
              actions={action ? [{ label: action.label, onPress: action.run }] : undefined}
            />
          );
        })}

        <Card>
          <View
            accessible
            accessibilityLabel={
              partial
                ? t('cost.totalsLabelPartial', { perLoaf: money(breakdown.perLoafCents) })
                : t('cost.totalsLabel', {
                    perLoaf: money(breakdown.perLoafCents),
                    loaves: loavesText,
                    batch: money(breakdown.batchCents),
                  })
            }
            style={{ gap: space.sm }}
          >
            <Text variant="footnote" color="textSecondary">
              {t(partial ? 'cost.perLoafPartial' : 'cost.perLoaf')}
            </Text>
            <View
              style={{
                flexDirection: stacked ? 'column' : 'row',
                gap: space.sm,
                alignItems: stacked ? 'flex-start' : 'center',
              }}
            >
              <Text variant="title1" numeric testID="per-loaf">
                {money(breakdown.perLoafCents)}
              </Text>
              {partial ? <StatusTag variant="unpriced" text={t('cost.incompleteTag')} /> : null}
            </View>
            <Divider />
            <View
              style={{ flexDirection: stacked ? 'column' : 'row', justifyContent: 'space-between' }}
            >
              <Text>{t('cost.batch', { loaves: loavesText })}</Text>
              <Text numeric testID="batch-total">
                {money(breakdown.batchCents)}
              </Text>
            </View>
            {count > 1 ? (
              <Text variant="footnote" color="textSecondary">
                {t('cost.rounding', { loaves: String(count), unit: money(1) })}
              </Text>
            ) : null}
          </View>
        </Card>

        <Card>
          <View
            style={{ gap: space.xs }}
            accessible
            accessibilityLabel={`${t('cost.sell')}, ${view.sellCents !== null ? money(view.sellCents) : partial ? t('cost.sell.incomplete') : t('cost.sell.zero')}`}
          >
            <Text variant="footnote" color="textSecondary">
              {t('cost.sell')}
            </Text>
            {view.sellCents !== null ? (
              <>
                <Text variant="title2" numeric testID="sell-price">
                  {money(view.sellCents)}
                </Text>
                <Text variant="footnote" color="textSecondary">
                  {stepText
                    ? t('cost.sell.basisRounded', { markup: markupText, step: stepText })
                    : t('cost.sell.basis', { markup: markupText })}
                </Text>
              </>
            ) : partial ? (
              <Text>{t('cost.sell.incomplete')}</Text>
            ) : (
              <>
                <Text variant="title2">–</Text>
                <Text variant="footnote" color="textSecondary">
                  {zeroBatch ? t('cost.sell.zero') : t('cost.sell.incomplete')}
                </Text>
              </>
            )}
          </View>
          {flags.costSettings ? (
            <Button
              variant="text"
              label={t('cost.sell.change')}
              onPress={() => router.push(routes.settingsCost)}
            />
          ) : null}
        </Card>
      </ContentColumn>

      <SectionHeader title={t('cost.byIngredient')} />
      <ContentColumn>
        {view.lines.map((line) => {
          const action = actionFor(line);
          const value = lineValueText(line, display);
          const share =
            line.cost.sharePct !== null
              ? formatRatioPercent(line.cost.sharePct, 100, display.locale)
              : '–';
          const detail = lineDetailText(line, display);
          const tappable =
            line.item !== null && (line.cost.status === 'priced' || line.cost.status === 'free');
          const spokenValue = lineValueSpoken(line, display);
          const label = speakable(
            [
              line.source.name,
              spokenValue ??
                (line.cost.status === 'conversionError'
                  ? t('cost.line.convertTag')
                  : t('cost.line.unpricedTag')),
              line.cost.sharePct !== null ? t('cost.line.share', { pct: share }) : null,
              detail,
            ]
              .filter(Boolean)
              .join(', '),
          );
          return (
            <View key={line.cost.lineId} style={{ paddingVertical: space.sm, gap: space.xs }}>
              <Pressable
                disabled={!tappable}
                accessibilityRole={tappable ? 'button' : undefined}
                accessibilityLabel={label}
                accessibilityHint={tappable ? t('cost.rowOpens') : undefined}
                onPress={() => line.item && router.push(routes.pantryItem(line.item.id))}
                style={{ gap: space.xs }}
                testID={`cost-line-${line.source.id}`}
              >
                <View
                  style={{
                    flexDirection: stacked ? 'column' : 'row',
                    justifyContent: 'space-between',
                    gap: space.sm,
                    alignItems: 'flex-start',
                  }}
                >
                  <Text numberOfLines={2} style={{ flexShrink: 1 }}>
                    {line.source.name}
                  </Text>
                  {value !== null ? (
                    <Text numeric>{value}</Text>
                  ) : (
                    <StatusTag
                      variant="unpriced"
                      text={t(
                        line.cost.status === 'conversionError'
                          ? 'cost.line.convertTag'
                          : 'cost.line.unpricedTag',
                      )}
                    />
                  )}
                </View>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}
                >
                  <Text variant="footnote" color="textSecondary" style={{ flexShrink: 1 }}>
                    {detail}
                  </Text>
                  <Text variant="footnote" color="textSecondary" numeric>
                    {share}
                  </Text>
                </View>
                {line.cost.sharePct !== null && line.cost.status !== 'unpriced' ? (
                  <ShareBar pct={line.cost.sharePct} />
                ) : null}
              </Pressable>
              {action ? (
                <Button
                  variant="text"
                  label={action.label}
                  accessibilityLabel={action.a11y}
                  onPress={action.run}
                />
              ) : null}
            </View>
          );
        })}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.md }}
        >
          <Text variant="headline">{t('cost.total')}</Text>
          <Text variant="headline" numeric>
            {money(breakdown.batchCents)}
          </Text>
        </View>
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          {!view.sharesSumTo100 ? (
            <Text variant="footnote" color="textSecondary">
              {t(
                currencyMinorDigits(display.currency) === 2
                  ? 'cost.sharesNote'
                  : 'cost.sharesNoteGeneric',
              )}
            </Text>
          ) : null}
          {anyBelow ? (
            <Text variant="footnote" color="textSecondary">
              {t('cost.belowNote', { money: money(1) })}
            </Text>
          ) : null}
          <Text variant="footnote" color="textSecondary">
            {t('cost.scopeNote')}
          </Text>
          <Text variant="footnote" color="textSecondary">
            {t('cost.snapshotNote')}
          </Text>
        </View>
      </ContentColumn>
      <PriceUpdateSheet item={priceTarget} onClose={() => setPriceTarget(null)} />
    </ScrollView>
  );
}
