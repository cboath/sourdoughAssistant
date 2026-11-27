import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { bakersPercentages, roundHalfUp, splitLevain } from '@sourdough/core';
import { t, tp } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { flags } from '../../../lib/flags';
import { href, routes } from '../../../lib/nav';
import { parseNumberInput } from '../../../lib/number';
import { showSnackbar } from '../../../state/snackbar';
import {
  ActionSheet,
  Banner,
  BottomActionBar,
  Button,
  Card,
  ContentColumn,
  Divider,
  EmptyState,
  HeaderTextButton,
  IconButton,
  ListRow,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  StatusTag,
  Stepper,
  Text,
  TextField,
} from '../../../ui/components';
import { confirm } from '../../../ui/confirm';
import { haptic } from '../../../ui/haptics';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import { useTheme } from '../../../ui/theme';
import { CostCard } from '../../cost/components/CostCard';
import { computeCostView } from '../../cost/compute';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { itemStatus } from '../../pantry/format';
import { usePantryList } from '../../pantry/hooks/usePantry';
import {
  amountDisplay,
  formatDuration,
  formatGrams,
  formatPercent,
  formatRatioPercent,
  speakable,
} from '../format';
import { useCostSettings, useRecipeService } from '../hooks/useRecipeData';
import { useRecipe } from '../hooks/useRecipes';
import { indexPantry, spanMinutes, toLines } from '../metrics';
import {
  MAX_PER_LOAF_G,
  MIN_PER_LOAF_G,
  applyScale,
  differsFromRecipe,
  initialScale,
  type ScaleState,
} from '../scaling';
import { stepLabel, stepSubtitle } from '../stepText';

/** RECIPE-DETAIL (screens-recipes.md section 10). Scaling is view-only session state. */
export function RecipeDetailScreen({ id, loaves }: { id: string; loaves?: number }) {
  const router = useRouter();
  const recipe = useRecipe(id);
  const pantry = usePantryList({ includeArchived: true });

  if (recipe.isPending || pantry.isPending) {
    return (
      <ContentColumn>
        <Skeleton rows={6} />
      </ContentColumn>
    );
  }
  if (recipe.isError || pantry.isError) {
    return (
      <EmptyState
        variant="error"
        title={t('detail.loadError')}
        action={{
          label: t('common.tryAgain'),
          onPress: () => void Promise.all([recipe.refetch(), pantry.refetch()]),
        }}
      />
    );
  }
  if (!recipe.data) {
    return (
      <EmptyState
        variant="error"
        title={t('detail.gone')}
        action={{ label: t('detail.backToRecipes'), onPress: () => router.replace(routes.recipes) }}
      />
    );
  }
  // Keyed by recipe so the session scale starts fresh for each recipe.
  return (
    <DetailBody key={id} aggregate={recipe.data} pantryItems={pantry.data ?? []} loaves={loaves} />
  );
}

type Aggregate = NonNullable<ReturnType<typeof useRecipe>['data']>;

function DetailBody({
  aggregate,
  pantryItems,
  loaves,
}: {
  aggregate: Aggregate;
  pantryItems: Parameters<typeof indexPantry>[0];
  loaves?: number;
}) {
  const router = useRouter();
  const { space, color, radius, layout } = useTheme();
  const { stacked, fontScale } = useFontScale();
  const tableStacked = fontScale >= layout.tableStackFontScale;
  const display = useDisplayContext();
  const service = useRecipeService();
  const settings = useCostSettings();
  const { recipe, ingredients, steps } = aggregate;

  const baseLines = useMemo(() => toLines(ingredients), [ingredients]);
  const initial = useMemo(
    () =>
      initialScale({
        yieldLoaves: recipe.yieldLoaves,
        doughWeightG: recipe.doughWeightG,
        lines: baseLines,
        loaves,
      }),
    [recipe.yieldLoaves, recipe.doughWeightG, baseLines, loaves],
  );
  const recipeScale = useMemo(
    () => ({ ...initial, loaves: recipe.yieldLoaves }),
    [initial, recipe.yieldLoaves],
  );
  const [scale, setScale] = useState<ScaleState>(initial);
  const [perLoafText, setPerLoafText] = useState(String(initial.perLoafG));
  const [perLoafError, setPerLoafError] = useState<string | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);

  const scaled = useMemo(
    () => applyScale(baseLines, recipe.yieldLoaves, scale, recipeScale),
    [baseLines, recipe.yieldLoaves, scale, recipeScale],
  );
  const bp = useMemo(() => bakersPercentages(scaled.lines), [scaled.lines]);
  const totals = bp.totals;
  const pantryById = useMemo(() => indexPantry(pantryItems), [pantryItems]);
  const cost = useMemo(
    () =>
      computeCostView({
        ingredients,
        pantryItems,
        yieldLoaves: recipe.yieldLoaves,
        loaves: scale.loaves,
        markupBps: settings.markupBps,
        sellRoundingCents: settings.sellRoundingCents,
        scaledLines: scaled.lines,
      }),
    [ingredients, pantryItems, recipe.yieldLoaves, scale.loaves, settings, scaled.lines],
  );
  const span = useMemo(() => spanMinutes(steps, scale.loaves), [steps, scale.loaves]);
  const bpByLine = useMemo(() => new Map(bp.rows.map((r) => [r.lineId, r.pct])), [bp.rows]);
  const lineById = useMemo(() => new Map(scaled.lines.map((l) => [l.id, l])), [scaled.lines]);

  const hasFlour = totals.totalFlourG > 0;
  const stepsOk = steps.length > 0 && span !== null;
  const differs = differsFromRecipe(scale, recipeScale, recipe.yieldLoaves);
  const hydration = formatRatioPercent(totals.totalWaterG, totals.totalFlourG, display.locale);

  const commitPerLoaf = (text: string) => {
    const n = parseNumberInput(text, display.locale);
    if (
      !n.ok ||
      !Number.isInteger(n.value) ||
      n.value < MIN_PER_LOAF_G ||
      n.value > MAX_PER_LOAF_G
    ) {
      setPerLoafError(t('val.scale.perLoaf'));
      return;
    }
    setPerLoafError(undefined);
    setScale((s) => ({ ...s, perLoafG: n.value }));
  };
  const nudge = (delta: number) => {
    haptic('selection');
    const next = Math.max(MIN_PER_LOAF_G, Math.min(MAX_PER_LOAF_G, scale.perLoafG + delta));
    setPerLoafError(undefined);
    setPerLoafText(String(next));
    setScale((s) => ({ ...s, perLoafG: next }));
  };
  const reset = () => {
    haptic('selection');
    setScale(recipeScale);
    setPerLoafText(String(recipeScale.perLoafG));
    setPerLoafError(undefined);
  };

  const toggleFavorite = () => {
    haptic('selection');
    service.setFavorite(recipe.id, !recipe.favorite).catch((error: unknown) => {
      logger.error('recipes.favorite_failed', error);
      showSnackbar({
        message: t('common.saveFailed'),
        actionLabel: t('common.retry'),
        onAction: toggleFavorite,
      });
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('recipe.delete.title', { name: recipe.name }),
      message: t('recipe.delete.body'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.keep'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await service.remove(recipe.id);
      router.replace(routes.recipes);
      showSnackbar({
        message: t('recipe.deleted', { name: recipe.name }),
        actionLabel: t('common.undo'),
        onAction: () => {
          haptic('impactLight');
          service.restore(recipe.id).catch((error: unknown) => {
            logger.error('recipes.restore_failed', error);
            showSnackbar({
              message: t('common.saveFailed'),
              actionLabel: t('common.retry'),
              onAction: () => void service.restore(recipe.id),
            });
          });
        },
      });
    } catch (error) {
      logger.error('recipes.delete_failed', error);
      showSnackbar({
        message: t('common.saveFailed'),
        actionLabel: t('common.retry'),
        onAction: () => void remove(),
      });
    }
  };

  const edit = () => router.push(routes.recipeEditor(recipe.id));
  const schedule = () =>
    router.push(href(`/bake/schedule/plan?recipeId=${recipe.id}&loaves=${scale.loaves}`));

  const scaleTotal =
    scaled.targetG !== null && scaled.targetG !== scaled.totalG
      ? t('detail.scale.totalTarget', {
          total: formatGrams(scaled.totalG, display.locale),
          target: formatGrams(scaled.targetG, display.locale),
        })
      : t('detail.scale.total', { total: formatGrams(scaled.totalG, display.locale) });

  useAnnounce(scaleTotal, 1000);

  const footnote =
    [
      scale.loaves !== recipe.yieldLoaves ? tp('recipes.row.loaves', scale.loaves) : null,
      scale.by === 'doughWeight' ? t('detail.bakeUsesDoughWeight') : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const stat = (value: string, label: string, spoken?: string) => (
    <View
      accessible
      accessibilityLabel={spoken ?? `${label}, ${value}`}
      style={{
        flex: stacked ? undefined : 1,
        alignItems: 'center',
        gap: space.xxs,
        paddingVertical: space.sm,
      }}
    >
      <Text variant="title2" numeric>
        {value}
      </Text>
      <Text variant="footnote" color="textSecondary" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: recipe.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton
                variant="toggle"
                icon={recipe.favorite ? 'star' : 'starOutline'}
                selected={recipe.favorite}
                accessibilityLabel={t('detail.favorite')}
                onPress={toggleFavorite}
                testID="detail-favorite"
              />
              {Platform.OS === 'android' ? (
                <IconButton
                  icon="edit"
                  accessibilityLabel={t('detail.editRecipe')}
                  onPress={edit}
                  testID="detail-edit"
                />
              ) : (
                <HeaderTextButton label={t('detail.edit')} onPress={edit} />
              )}
              <IconButton
                icon="more"
                accessibilityLabel={t('detail.more')}
                onPress={() => setMenuOpen(true)}
                testID="detail-more"
              />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <ContentColumn padded={false}>
          <View style={{ padding: space.lg, gap: space.xs }}>
            <Text variant="title1" heading>
              {recipe.name}
            </Text>
            {recipe.tags.length > 0 ? (
              <Text variant="subhead" color="textSecondary">
                {recipe.tags.join(' · ')}
              </Text>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            {steps.length === 0 ? (
              <Banner
                variant="warning"
                message={t('detail.noSteps')}
                actions={[{ label: t('detail.editRecipe'), onPress: edit }]}
              />
            ) : null}
            {!hasFlour ? (
              <Banner
                variant="warning"
                message={t('detail.noFlour')}
                actions={[{ label: t('detail.editRecipe'), onPress: edit }]}
              />
            ) : null}

            <Card>
              <View style={{ flexDirection: stacked ? 'column' : 'row' }}>
                {stat(
                  hasFlour ? hydration : '–',
                  hasFlour ? t('detail.stat.hydration') : t('detail.stat.addFlour'),
                  hasFlour ? t('detail.stat.hydrationLabel', { pct: hydration }) : undefined,
                )}
                {stat(
                  formatGrams(roundHalfUp(scaled.totalG / scale.loaves), display.locale),
                  t('detail.stat.perLoaf'),
                )}
                {stat(
                  stepsOk ? formatDuration(span, display.locale) : '–',
                  steps.length > 0 && !stepsOk ? t('detail.stat.fixSteps') : t('detail.stat.time'),
                )}
              </View>
            </Card>
          </View>

          <SectionHeader title={t('detail.scale')} />
          {scaled.scaled ? (
            <Text variant="footnote" color="textSecondary" style={{ paddingHorizontal: space.lg }}>
              {t('detail.scale.factor', {
                factor: new Intl.NumberFormat(display.locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(scaled.factor),
              })}
            </Text>
          ) : null}
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <SegmentedControl
              label={t('detail.scale.mode')}
              value={scale.by}
              onChange={(by) => {
                haptic('selection');
                setScale((s) => ({ ...s, by }));
              }}
              segments={[
                { value: 'loaves', label: t('detail.scale.loaves') },
                { value: 'doughWeight', label: t('detail.scale.weight') },
              ]}
              testID="scale-mode"
            />
            <Stepper
              label={t('detail.scale.loaves')}
              value={scale.loaves}
              min={1}
              max={50}
              onChange={(n) => {
                haptic('selection');
                setScale((s) => ({ ...s, loaves: n }));
              }}
              formatValue={(n) => tp('recipes.row.loaves', n)}
              testID="scale-loaves"
            />
            {scale.by === 'doughWeight' ? (
              <View style={{ gap: space.sm }}>
                <TextField
                  label={t('detail.scale.perLoaf')}
                  variant="number"
                  suffix="g"
                  value={perLoafText}
                  onChangeText={setPerLoafText}
                  onBlur={() => commitPerLoaf(perLoafText)}
                  onSubmitEditing={() => commitPerLoaf(perLoafText)}
                  error={perLoafError}
                  testID="per-loaf"
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  <Button
                    variant="tonal"
                    size="lg"
                    label={t('detail.scale.minus')}
                    accessibilityLabel={t('detail.scale.minusLabel')}
                    onPress={() => nudge(-50)}
                    testID="per-loaf-minus"
                  />
                  <Button
                    variant="tonal"
                    size="lg"
                    label={t('detail.scale.plus')}
                    accessibilityLabel={t('detail.scale.plusLabel')}
                    onPress={() => nudge(50)}
                    testID="per-loaf-plus"
                  />
                </View>
              </View>
            ) : null}
            <Text variant="footnote" numeric testID="scale-total">
              {scaleTotal}
            </Text>
            {differs ? (
              <Button
                variant="text"
                label={t('common.reset')}
                onPress={reset}
                testID="scale-reset"
              />
            ) : null}
          </View>

          <SectionHeader title={t('detail.ingredients')} />
          {ingredients.length === 0 ? (
            <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
              <Text color="textSecondary">{t('detail.noIngredients')}</Text>
              <Button variant="tonal" label={t('detail.addIngredients')} onPress={edit} />
            </View>
          ) : (
            <View>
              {!tableStacked ? (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={{ flexDirection: 'row', paddingHorizontal: space.lg, gap: space.md }}
                >
                  <View style={{ flex: 1 }} />
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={{ width: 96, textAlign: 'right' }}
                  >
                    {t('detail.col.amount')}
                  </Text>
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={{ width: 64, textAlign: 'right' }}
                  >
                    {t('detail.col.bp')}
                  </Text>
                </View>
              ) : null}
              {ingredients.map((ing) => {
                const line = lineById.get(ing.id);
                const amountG = line?.amountG ?? ing.amountG;
                const item = ing.pantryItemId ? pantryById.get(ing.pantryItemId) : undefined;
                const amount = amountDisplay(amountG, display, item ?? undefined);
                const pct = bpByLine.get(ing.id);
                const pctText = pct == null ? '–' : formatRatioPercent(pct, 100, display.locale);
                const status = item ? itemStatus(item) : 'unpriced';
                const tag =
                  status === 'needsDensity'
                    ? t('pantry.row.needsDensity')
                    : status === 'needsEach'
                      ? t('pantry.row.needsEach')
                      : status === 'unpriced'
                        ? t('status.unpriced')
                        : null;
                const levain =
                  ing.role === 'levain'
                    ? splitLevain(amountG, ing.levainHydrationPct ?? 100)
                    : null;
                const levainSub = levain
                  ? t('detail.levainSub', {
                      hydration: formatPercent(ing.levainHydrationPct ?? 100, display.locale, 0),
                      flour: formatGrams(levain.flourG, display.locale),
                      water: formatGrams(levain.waterG, display.locale),
                    })
                  : null;
                const archived = item?.deletedAt ? ` ${t('edit.archivedSuffix')}` : '';
                const label = speakable(
                  levain
                    ? t('detail.levainRowLabel', {
                        name: `${ing.name}${archived}`,
                        amount: amount.primary,
                        hydration: formatPercent(ing.levainHydrationPct ?? 100, display.locale, 0),
                        flour: formatGrams(levain.flourG, display.locale),
                        water: formatGrams(levain.waterG, display.locale),
                        pct: pctText,
                      })
                    : t('detail.rowLabel', {
                        name: `${ing.name}${archived}`,
                        amount: `${amount.primary}${amount.secondary ? `, ${amount.secondary}` : ''}`,
                        pct: pctText,
                      }),
                );
                return (
                  <View
                    key={ing.id}
                    accessible
                    accessibilityLabel={label}
                    style={{
                      paddingHorizontal: space.lg,
                      paddingVertical: space.sm,
                      gap: space.xs,
                    }}
                    testID={`detail-line-${ing.id}`}
                  >
                    <View
                      style={{
                        flexDirection: tableStacked ? 'column' : 'row',
                        gap: space.md,
                        alignItems: 'flex-start',
                      }}
                    >
                      <View style={{ flex: tableStacked ? undefined : 1, gap: space.xs }}>
                        <Text numberOfLines={2}>{`${ing.name}${archived}`}</Text>
                        {levainSub ? (
                          <Text variant="footnote" color="textSecondary">
                            {levainSub}
                          </Text>
                        ) : null}
                        {tag ? <StatusTag variant="unpriced" text={tag} /> : null}
                      </View>
                      {tableStacked ? (
                        <Text numeric>{`${amount.primary} · ${pctText}`}</Text>
                      ) : (
                        <>
                          <View style={{ width: 96, alignItems: 'flex-end' }}>
                            <Text numeric>{amount.primary}</Text>
                            {amount.secondary ? (
                              <Text variant="footnote" color="textSecondary" numeric>
                                {amount.secondary}
                              </Text>
                            ) : null}
                          </View>
                          <Text numeric style={{ width: 64, textAlign: 'right' }}>
                            {pctText}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
              <View
                style={{
                  margin: space.lg,
                  padding: space.md,
                  borderRadius: radius.md,
                  backgroundColor: color.surfaceSunken,
                  gap: space.xs,
                }}
              >
                <TotalsBlock
                  flour={formatGrams(totals.totalFlourG, display.locale)}
                  levainFlour={
                    totals.levainFlourG > 0
                      ? formatGrams(totals.levainFlourG, display.locale)
                      : null
                  }
                  water={formatGrams(totals.totalWaterG, display.locale)}
                  levainWater={
                    totals.levainWaterG > 0
                      ? formatGrams(totals.levainWaterG, display.locale)
                      : null
                  }
                  hydration={hydration}
                  dough={formatGrams(totals.totalDoughG, display.locale)}
                />
              </View>
              <Text
                variant="footnote"
                color="textSecondary"
                style={{ paddingHorizontal: space.lg }}
              >
                {t('detail.bpExplain', { base: formatGrams(bp.baseFlourG, display.locale) })}
              </Text>
            </View>
          )}

          <View style={{ padding: space.lg }}>
            <CostCard
              view={cost}
              ctx={display}
              lineCount={ingredients.length}
              onPress={() => router.push(routes.recipeCost(recipe.id, scale.loaves))}
            />
          </View>

          <SectionHeader
            title={
              span !== null
                ? `${t('detail.steps')} · ${t('detail.steps.total', { duration: formatDuration(span, display.locale) })}`
                : t('detail.steps')
            }
          />
          {steps.length === 0 ? (
            <Text color="textSecondary" style={{ paddingHorizontal: space.lg }}>
              {t('detail.steps.none')}
            </Text>
          ) : (
            steps.map((step, index) => {
              const alongside = step.anchor.type === 'alongside';
              const seq =
                steps.slice(0, index).filter((s) => s.anchor.type === 'sequential').length + 1;
              const subtitle = alongside
                ? t('detail.alongside', {
                    step:
                      steps.find(
                        (s) => step.anchor.type === 'alongside' && s.id === step.anchor.stepId,
                      )?.name ?? '?',
                  })
                : stepSubtitle(step, steps, display.locale);
              return (
                <View key={step.id} style={{ paddingStart: alongside ? space.xl : 0 }}>
                  <ListRow
                    title={alongside ? step.name : `${seq}. ${step.name}`}
                    subtitle={subtitle}
                    accessibilityLabel={stepLabel(step, seq - 1, steps, display.locale)}
                    trailing={
                      step.tempSensitive || !step.notify ? (
                        <View style={{ gap: space.xs }}>
                          {step.tempSensitive ? (
                            <StatusTag variant="adjusted" text={t('edit.step.tempTag')} />
                          ) : null}
                          {!step.notify ? (
                            <StatusTag variant="remindersOff" text={t('edit.step.noReminder')} />
                          ) : null}
                        </View>
                      ) : undefined
                    }
                  />
                </View>
              );
            })
          )}

          {recipe.notes.trim() !== '' ? (
            <>
              <SectionHeader title={t('detail.notes')} />
              <Text selectable style={{ paddingHorizontal: space.lg }}>
                {recipe.notes}
              </Text>
            </>
          ) : null}
          <Divider />
        </ContentColumn>
      </ScrollView>
      {flags.scheduling ? (
        <BottomActionBar footnote={footnote} insideTabs>
          <Button
            size="lg"
            fullWidth
            label={t('detail.schedule')}
            onPress={schedule}
            disabled={!stepsOk}
            accessibilityHint={!stepsOk ? t('detail.cantSchedule') : undefined}
            testID="schedule"
          />
        </BottomActionBar>
      ) : null}
      <ActionSheet
        title={menuOpen ? recipe.name : null}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: t('detail.duplicate'),
            onPress: () => router.push(routes.recipeEditor('new', `?duplicateOf=${recipe.id}`)),
          },
          { label: t('detail.delete'), destructive: true, onPress: () => void remove() },
        ]}
      />
    </View>
  );
}

function TotalsBlock(props: {
  flour: string;
  levainFlour: string | null;
  water: string;
  levainWater: string | null;
  hydration: string;
  dough: string;
}) {
  const { space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={[
        t('detail.totalFlour', { weight: props.flour }),
        props.levainFlour ? t('detail.inclLevain', { weight: props.levainFlour }) : null,
        t('detail.totalWater', { weight: props.water }),
        props.levainWater ? t('detail.inclLevain', { weight: props.levainWater }) : null,
        t('detail.hydration', { pct: props.hydration }),
        t('detail.totalDough', { weight: props.dough }),
      ]
        .filter(Boolean)
        .join('. ')}
      style={{ gap: space.xs }}
      testID="totals-block"
    >
      <Text variant="callout" numeric>
        {t('detail.totalFlour', { weight: props.flour })}
      </Text>
      {props.levainFlour ? (
        <Text variant="footnote" color="textSecondary" numeric>
          {t('detail.inclLevain', { weight: props.levainFlour })}
        </Text>
      ) : null}
      <Text variant="callout" numeric>
        {t('detail.totalWater', { weight: props.water })}
      </Text>
      {props.levainWater ? (
        <Text variant="footnote" color="textSecondary" numeric>
          {t('detail.inclLevain', { weight: props.levainWater })}
        </Text>
      ) : null}
      <Text variant="callout" numeric>
        {t('detail.hydration', { pct: props.hydration })}
      </Text>
      <Text variant="callout" numeric>
        {t('detail.totalDough', { weight: props.dough })}
      </Text>
    </View>
  );
}
