import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { formatMoney, utcToLocal, doughTotals } from '@sourdough/core';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, View } from 'react-native';
import type { RecipeAggregate } from '../../../db/types';
import { clock, useNow } from '../../../lib/clock';
import { t, tp } from '../../../lib/i18n';
import { routes } from '../../../lib/nav';
import { showSnackbar } from '../../../state/snackbar';
import {
  Banner,
  BottomActionBar,
  Button,
  ContentColumn,
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
} from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useScreenMargin } from '../../../ui/hooks/useScreenMargin';
import { useReducedMotion } from '../../../ui/hooks/useReducedMotion';
import { useTheme } from '../../../ui/theme';
import { resolvePostScheduleRoute } from '../../notifications/permissions';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { usePantryList } from '../../pantry/hooks/usePantry';
import { formatGrams, loavesText } from '../../recipes/format';
import { useRecipeAggregates } from '../../recipes/hooks/useRecipeData';
import { useCloseScheduleModal } from '../useCloseScheduleModal';
import { defaultReadyLocal } from '../defaults';
import { letterFor, MAX_RECIPES_PER_BAKE } from '../labels';
import { buildPreview, type PreviewInput, type PreviewItem } from '../preview';
import { reasonText } from '../reasons';
import { computeItemCost, hasAnyPrice, toStepTemplates, type ItemCost } from '../snapshot';
import { MAX_LOAVES, MAX_OVEN_CAPACITY, useScheduleDraft, type DraftItem } from '../store';
import { tempEffects } from '../tempEffect';
import { formatClock, formatDayTime, formatSpan, formatTemperature } from '../time';
import { buildTimeline, type TimelineRow, type WarningLine } from '../timeline';
import { useBakeHeaders, useBakeService } from '../hooks/useScheduleData';
import { useScheduleSettings } from '../hooks/useScheduleSettings';
import { LetterBadge } from './LetterBadge';
import { ReadyField } from './ReadyField';
import { RecipeAddSheet } from './RecipeAddSheet';
import { TempSheet } from './TempSheet';
import { TimelineRowView } from './TimelineRowView';
import { WarningsCard } from './WarningsCard';

export interface SchedulePlanScreenProps {
  /** Route params prefill the draft; nothing is written on mount (SEC-01 M2). */
  recipeId?: string;
  loaves?: number;
}

/** SCHED-PLAN (screens-bake.md section 3). */
export function SchedulePlanScreen({ recipeId, loaves }: SchedulePlanScreenProps) {
  const router = useRouter();
  const recipes = useRecipeAggregates();
  const pantry = usePantryList({ includeArchived: true });
  const headers = useBakeHeaders();
  const items = useScheduleDraft((s) => s.items);
  const [prefilled, setPrefilled] = useState(recipeId === undefined);

  // Params only prefill the draft, once the recipe is known (its own yield is the default loaves).
  useEffect(() => {
    if (prefilled || !recipes.data || !recipeId) return;
    const draft = useScheduleDraft.getState();
    const same = draft.items.length === 1 && draft.items[0]?.recipeId === recipeId;
    if (!same) {
      const found = recipes.data.find((r) => r.recipe.id === recipeId);
      draft.reset();
      draft.setSelection([{ recipeId, loaves: loaves ?? found?.recipe.yieldLoaves ?? 1 }]);
    }
    setPrefilled(true);
  }, [prefilled, recipes.data, recipeId, loaves]);

  if (recipes.isPending || pantry.isPending || headers.isPending || !prefilled) {
    return (
      <ContentColumn>
        <Skeleton rows={6} variant="detail" />
      </ContentColumn>
    );
  }
  if (recipes.isError || pantry.isError || headers.isError) {
    return (
      <EmptyState
        variant="error"
        title={t('plan.loadError')}
        action={{
          label: t('common.tryAgain'),
          onPress: () => void Promise.all([recipes.refetch(), pantry.refetch(), headers.refetch()]),
        }}
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('plan.empty')}
        action={{
          label: t('plan.empty.action'),
          onPress: () => router.replace(routes.schedulePick),
        }}
      />
    );
  }
  return <PlanBody recipes={recipes.data} />;
}

interface Resolved {
  draft: DraftItem;
  recipe: RecipeAggregate | null;
}

function PlanBody({ recipes }: { recipes: RecipeAggregate[] }) {
  const router = useRouter();
  const { space } = useTheme();
  const margin = useScreenMargin();
  const display = useDisplayContext();
  const settings = useScheduleSettings();
  const bakeService = useBakeService();
  const pantry = usePantryList({ includeArchived: true });
  const headers = useBakeHeaders();
  const draft = useScheduleDraft();
  const tick = useNow(30_000);
  const [pressedAt, setPressedAt] = useState(0);
  const now = Math.max(tick, pressedAt);
  const zone = clock.zone();
  const { locale, currency } = display;
  const ctxTime = useMemo(() => ({ zone, locale, now }), [zone, locale, now]);

  const [openSlider, setOpenSlider] = useState<string | null>(null);
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<string>>(new Set());
  const [tempOpen, setTempOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const listRef = useRef<FlashListRef<TimelineRow> | null>(null);

  const ovenCapacity = draft.ovenCapacity ?? settings.ovenCapacity;
  const pantryItems = useMemo(() => pantry.data ?? [], [pantry.data]);

  const resolved: Resolved[] = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.recipe.id, r]));
    return draft.items.map((d) => ({ draft: d, recipe: byId.get(d.recipeId) ?? null }));
  }, [draft.items, recipes]);
  const gone = resolved.filter((r) => !r.recipe);
  const live = useMemo(
    () => resolved.filter((r): r is { draft: DraftItem; recipe: RecipeAggregate } => !!r.recipe),
    [resolved],
  );
  const previewItems: PreviewItem[] = useMemo(
    () =>
      live.map(({ draft: d, recipe }) => ({
        itemId: d.tempId,
        name: recipe.recipe.name,
        steps: toStepTemplates(recipe),
        loaves: d.loaves,
        overrides: d.overrides,
      })),
    [live],
  );
  const multi = live.length > 1;
  const totalLoaves = live.reduce((sum, r) => sum + r.draft.loaves, 0);

  // The smart default, computed once when the draft has recipes and no ready time yet.
  useEffect(() => {
    const state = useScheduleDraft.getState();
    if (state.readyLocal !== null || previewItems.length === 0 || !headers.data) return;
    state.setDefaultReady(
      defaultReadyLocal(
        {
          items: previewItems,
          ovenCapacity,
          reheatGapMin: settings.reheatGapMin,
          kitchenTempC: state.kitchenTempC,
          quiet: settings.quiet,
          zone,
          now: clock.now(),
        },
        headers.data,
      ),
    );
  }, [previewItems, headers.data, ovenCapacity, settings, zone]);

  const input: PreviewInput = useMemo(
    () => ({
      items: previewItems,
      mode: draft.mode,
      readyLocal: draft.readyLocal,
      ovenCapacity,
      reheatGapMin: settings.reheatGapMin,
      kitchenTempC: draft.kitchenTempC,
      quiet: settings.quiet,
      zone,
      now,
    }),
    [
      previewItems,
      draft.mode,
      draft.readyLocal,
      draft.kitchenTempC,
      ovenCapacity,
      settings,
      zone,
      now,
    ],
  );
  const preview = useMemo(() => buildPreview(input), [input]);

  const model = useMemo(
    () =>
      buildTimeline(
        preview,
        previewItems.map((i) => ({
          itemId: i.itemId,
          name: i.name,
          steps: i.steps,
          loaves: i.loaves,
        })),
        {
          time: ctxTime,
          unit: settings.temperatureUnit,
          kitchenTempC: draft.kitchenTempC,
          quiet: settings.quiet,
          expandedFolds,
        },
      ),
    [preview, previewItems, ctxTime, settings, draft.kitchenTempC, expandedFolds],
  );

  const costs: ItemCost[] = useMemo(
    () =>
      live.map(({ draft: d, recipe }) =>
        computeItemCost(
          recipe,
          d.loaves,
          pantryItems,
          settings.markupBps,
          settings.sellRoundingCents,
        ),
      ),
    [live, pantryItems, settings],
  );

  const plan = preview.plan;
  const tooSoon = preview.status === 'tooSoon';
  const blocked = preview.status !== 'ok' || gone.length > 0;

  const firstStep = plan?.steps[0];
  const readyDayTime = plan ? formatDayTime(plan.readyAt, ctxTime) : '';
  const startDayTime = plan ? formatDayTime(plan.startAt, ctxTime) : '';
  useAnnounce(
    draft.touched && plan && !blocked
      ? t('plan.announce', { dayTime: startDayTime, readyDayTime })
      : null,
    1000,
  );

  // When the last warning goes away, say so (screens-bake.md 3.5 B).
  const warningCount = model.warningLines.length;
  const previousWarnings = useRef(warningCount);
  useEffect(() => {
    if (previousWarnings.current > 0 && warningCount === 0) {
      AccessibilityInfo.announceForAccessibility(t('plan.warn.cleared'));
    }
    previousWarnings.current = warningCount;
  }, [warningCount]);

  const toggleFolds = useCallback((key: string) => {
    setExpandedFolds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const closeModal = useCloseScheduleModal();
  const reduceMotion = useReducedMotion();
  const rowNodes = useRef(new Map<string, ComponentRef<typeof View>>());
  const { motion } = useTheme();
  /** A blocked Schedule tap: buzz, scroll the banner into view and say why (DR2-07). */
  const explainBlocked = useCallback(
    (kind: 'gone' | 'tooSoon' | 'invalid') => {
      haptic('warning');
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      AccessibilityInfo.announceForAccessibility(
        t(
          kind === 'gone'
            ? 'plan.cantSchedule.gone'
            : kind === 'tooSoon'
              ? 'plan.cantSchedule.tooSoon'
              : 'plan.cantSchedule.invalid',
        ),
      );
    },
    [reduceMotion],
  );

  const select = useCallback(
    (line: WarningLine) => {
      haptic('selection');
      const index = model.rows.findIndex((r) => r.type === 'step' && r.id === line.rowId);
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
      setHighlight(line.rowId);
      // Move screen-reader focus to the row once the scroll has settled (DR2-16). With reduce
      // motion the highlight stays until the next scroll; otherwise it fades after a moment.
      const settle = setTimeout(
        () => {
          const node = rowNodes.current.get(line.rowId);
          const handle = node ? findNodeHandle(node) : null;
          if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
        },
        reduceMotion ? 0 : motion.duration.standard,
      );
      (settle as { unref?: () => void }).unref?.();
      if (!reduceMotion) {
        const timer = setTimeout(() => setHighlight(null), motion.duration.emphasized * 4);
        (timer as { unref?: () => void }).unref?.();
      }
    },
    [model.rows, reduceMotion, motion.duration.standard, motion.duration.emphasized],
  );

  const save = useCallback(async () => {
    const stamp = clock.now();
    const fresh = buildPreview({ ...input, now: stamp });
    if (fresh.status !== 'ok' || gone.length > 0) {
      // The clock passed the first step while the user was reading (screens-bake.md 3.6).
      explainBlocked(gone.length > 0 ? 'gone' : fresh.status === 'invalid' ? 'invalid' : 'tooSoon');
      setPressedAt(stamp);
      return;
    }
    setSaving(true);
    try {
      const created = await bakeService.create({
        preview: fresh,
        mode: draft.mode,
        items: live.map((r) => ({
          itemId: r.draft.tempId,
          recipe: r.recipe,
          loaves: r.draft.loaves,
        })),
        kitchenTempC: draft.kitchenTempC,
        ovenCapacity,
        reheatGapMin: settings.reheatGapMin,
        headsUpMin: settings.headsUpMin,
        currencyCode: currency,
        markupBps: settings.markupBps,
        sellRoundingCents: settings.sellRoundingCents,
        pantryItems,
        zone,
        now: stamp,
      });
      haptic('success');
      // Closing is no longer a discard; the layout drops the draft when the modal unmounts.
      useScheduleDraft.getState().markSaved();
      // The bake is saved first; a primer is pushed inside the modal when one is due.
      const next = await resolvePostScheduleRoute();
      if (next === 'permission-notifications') {
        router.push(routes.permissionNotifications(created.bake.id));
        return;
      }
      if (next === 'permission-alarm') {
        router.push(routes.permissionAlarm(created.bake.id));
        return;
      }
      router.dismissAll();
      router.navigate(routes.bakes);
      router.push(routes.bake(created.bake.id));
    } catch {
      setSaving(false);
      showSnackbar({
        message: t('plan.saveFailed'),
        actionLabel: t('plan.retry'),
        onAction: () => void save(),
      });
    }
  }, [
    explainBlocked,
    input,
    gone.length,
    bakeService,
    draft.mode,
    draft.kitchenTempC,
    live,
    ovenCapacity,
    settings,
    currency,
    pantryItems,
    zone,
    router,
  ]);

  const money = (cents: number) => formatMoney(cents, currency, locale);
  const costLine = (cost: ItemCost | undefined) => {
    if (!cost || !hasAnyPrice(cost)) return null;
    const batch = money(cost.breakdown.batchCents);
    return cost.breakdown.complete
      ? t('plan.cost', { batch, perLoaf: money(cost.breakdown.perLoafCents) })
      : t('plan.costPartial', { batch });
  };
  const costIncomplete = (cost: ItemCost | undefined) =>
    !!cost && hasAnyPrice(cost) && !cost.breakdown.complete;

  const lastTemp = useMemo(() => {
    const withTemp = (headers.data ?? [])
      .filter((b) => b.kitchenTempC !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return withTemp?.kitchenTempC ?? 21;
  }, [headers.data]);
  const effectsFor = useCallback(
    (tempC: number) => tempEffects(previewItems, tempC),
    [previewItems],
  );

  const removeItem = (tempId: string, name: string) => {
    haptic('selection');
    const removed = useScheduleDraft.getState().removeItem(tempId);
    if (!removed) return;
    showSnackbar({
      message: t('plan.multi.removed', { recipe: name }),
      actionLabel: t('common.undo'),
      onAction: () => {
        haptic('impactLight');
        useScheduleDraft.getState().restoreItem(removed.item, removed.index);
      },
    });
  };

  const header = (
    <ContentColumn padded={false}>
      <View style={{ gap: space.lg, paddingBottom: space.lg }}>
        <View
          style={{
            paddingLeft: margin.left,
            paddingRight: margin.right,
            gap: space.md,
            paddingTop: space.md,
          }}
        >
          {multi ? (
            <MultiBlock
              live={live}
              costs={costs}
              costLine={costLine}
              costIncomplete={costIncomplete}
              totalLoaves={totalLoaves}
              onRemove={removeItem}
              onAdd={() => setAddOpen(true)}
            />
          ) : live[0] ? (
            <SingleBlock
              item={live[0]}
              locale={locale}
              costLine={costLine(costs[0])}
              incomplete={costIncomplete(costs[0])}
            />
          ) : null}
          {multi || live.length === 0 ? null : (
            <AddRecipeRow
              onPress={() => setAddOpen(true)}
              disabled={live.length >= MAX_RECIPES_PER_BAKE}
            />
          )}
          <SegmentedControl
            label={t('plan.mode')}
            testID="plan-mode"
            segments={[
              { value: 'backward', label: t('plan.mode.readyAt') },
              { value: 'forward', label: t('plan.mode.startNow') },
            ]}
            value={draft.mode}
            onChange={(mode) => {
              haptic('selection');
              draft.setMode(mode);
            }}
          />
          {draft.mode === 'backward' ? (
            draft.readyLocal ? (
              <ReadyField
                testID="ready-field"
                value={draft.readyLocal}
                zone={zone}
                locale={locale}
                now={now}
                adjustment={preview.readyAdjustment}
                error={tooSoon}
                onChange={draft.setReadyLocal}
              />
            ) : null
          ) : (
            <View style={{ gap: space.xs }}>
              <Text variant="subhead">{t('plan.ready')}</Text>
              <Text variant="title3" numeric>
                {plan ? formatDayTime(plan.readyAt, ctxTime) : ''}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {t('plan.startNow.note')}
              </Text>
            </View>
          )}
          {draft.mode === 'backward' && firstStep && !tooSoon ? (
            <Text variant="footnote" color="textSecondary">
              {t('plan.firstStep', {
                dayTime: formatDayTime(firstStep.startAt, ctxTime),
                step: firstStep.name,
              })}
            </Text>
          ) : null}
        </View>

        {totalLoaves > 1 ? (
          <View style={{ paddingLeft: margin.left, paddingRight: margin.right, gap: space.xs }}>
            <Text variant="subhead">{t('plan.oven')}</Text>
            <Stepper
              testID="oven-stepper"
              label={t('plan.oven')}
              value={ovenCapacity}
              min={1}
              max={MAX_OVEN_CAPACITY}
              onChange={draft.setOvenCapacity}
            />
            {plan ? (
              <Text variant="footnote">
                {plan.slots.length > 1
                  ? t('plan.oven.slots', {
                      slots: plan.slots.length,
                      time: formatClock(plan.readyAt, zone, locale),
                    })
                  : tp('plan.oven.together', totalLoaves)}
              </Text>
            ) : null}
            <Text variant="footnote" color="textSecondary">
              {t('plan.oven.default', { capacity: settings.ovenCapacity })}
            </Text>
          </View>
        ) : null}

        <View>
          <ListRow
            testID="temp-row"
            title={t('plan.temp')}
            variant="value"
            value={
              draft.kitchenTempC === null
                ? t('plan.temp.notSet')
                : formatTemperature(draft.kitchenTempC, settings.temperatureUnit)
            }
            accessibilityHint={t('plan.temp.opens')}
            onPress={() => setTempOpen(true)}
          />
          {draft.kitchenTempC !== null ? (
            <View style={{ paddingLeft: margin.left, paddingRight: margin.right, gap: space.xs }}>
              {(() => {
                const effects = tempEffects(previewItems, draft.kitchenTempC);
                if (effects.length === 0) {
                  return (
                    <Text variant="footnote" color="textSecondary">
                      {t('plan.temp.noEffect')}
                    </Text>
                  );
                }
                return effects.map((e) => (
                  <Text key={e.itemIndex} variant="footnote">
                    {multi ? `${letterFor(e.itemIndex)} · ` : ''}
                    {t('plan.temp.effect', {
                      step: e.stepName,
                      duration: formatSpan(e.minutes, locale),
                      recipeDuration: formatSpan(e.recipeMinutes, locale),
                    })}
                  </Text>
                ));
              })()}
            </View>
          ) : null}
        </View>

        <View style={{ paddingLeft: margin.left, paddingRight: margin.right, gap: space.md }}>
          {gone.length > 0 ? (
            <Banner
              variant="danger"
              testID="banner-gone"
              message={t('plan.recipeGone')}
              actions={[
                { label: t('plan.backToRecipes'), onPress: () => router.replace(routes.recipes) },
              ]}
            />
          ) : null}
          {tooSoon && preview.earliestReadyAt !== null && plan ? (
            <>
              <Banner
                variant="danger"
                testID="banner-too-soon"
                message={t('plan.tooSoon', {
                  span: formatSpan(preview.spanMin ?? 0, locale),
                  dayTime: formatDayTime(preview.earliestReadyAt, ctxTime),
                })}
                actions={[
                  {
                    label: t('plan.tooSoon.use', {
                      dayTime: formatDayTime(preview.earliestReadyAt, ctxTime),
                    }),
                    onPress: () => {
                      const at = utcToLocal(preview.earliestReadyAt as number, zone);
                      draft.setReadyLocal({ date: at.date, time: at.time });
                      AccessibilityInfo.announceForAccessibility(
                        t('plan.announce.ready', {
                          dayTime: formatDayTime(preview.earliestReadyAt as number, ctxTime, true),
                        }),
                      );
                    },
                  },
                  ...(preview.shortestFits
                    ? [
                        {
                          label: t('plan.tooSoon.shortest'),
                          onPress: () =>
                            live.forEach((r, i) =>
                              draft.replaceOverrides(
                                r.draft.tempId,
                                preview.shortestOverrides[i] ?? {},
                              ),
                            ),
                        },
                      ]
                    : []),
                ]}
              />
              <Text variant="footnote" color="textSecondary">
                {t('plan.tooSoon.preview')}
              </Text>
            </>
          ) : null}
          {preview.status === 'invalid'
            ? Array.from(new Set(preview.errors.map((e) => e.itemIndex))).map((itemIndex) => {
                const error = preview.errors.find((e) => e.itemIndex === itemIndex)!.error;
                const item = previewItems[itemIndex];
                const row = live[itemIndex];
                if (!item || !row) return null;
                return (
                  <Banner
                    key={item.itemId}
                    variant="danger"
                    testID={`banner-invalid-${itemIndex}`}
                    message={t('plan.invalid', {
                      recipe: item.name,
                      reason: reasonText(error, item.steps),
                    })}
                    actions={[
                      {
                        label: t('pick.edit'),
                        onPress: () => router.push(routes.recipeEditor(row.recipe.recipe.id)),
                      },
                      ...(error.code === 'noOvenPhase' && totalLoaves <= MAX_OVEN_CAPACITY
                        ? [
                            {
                              label: t('plan.invalid.capacity', { total: totalLoaves }),
                              onPress: () => draft.setOvenCapacity(totalLoaves),
                            },
                          ]
                        : []),
                    ]}
                  />
                );
              })
            : null}
          <WarningsCard lines={model.warningLines} onSelect={select} />
        </View>

        <SectionHeader
          title={t('plan.timeline')}
          trailingText={
            preview.spanMin !== null
              ? t('plan.span', { span: formatSpan(preview.spanMin, locale) })
              : undefined
          }
        />
      </View>
    </ContentColumn>
  );

  const renderRow = useCallback(
    ({ item: row }: { item: TimelineRow }) => (
      <ContentColumn padded={false}>
        <View
          ref={(node) => {
            if (node) rowNodes.current.set(row.id, node);
            else rowNodes.current.delete(row.id);
          }}
        >
          <TimelineRowView
            row={row}
            locale={locale}
            highlighted={highlight === row.id}
            sliderOpen={openSlider === row.id}
            onToggleSlider={(id) => setOpenSlider((cur) => (cur === id ? null : id))}
            onToggleFolds={toggleFolds}
            onSliderChange={(itemId, stepId, minutes) => {
              const base =
                preview.baseChoices[previewItems.findIndex((i) => i.itemId === itemId)]?.[stepId]
                  ?.minutes;
              // Dragging back to the base value drops the override, so the temperature tag returns.
              draft.setOverride(itemId, stepId, minutes === base ? null : minutes);
            }}
            onSliderReset={(itemId, stepId) => draft.setOverride(itemId, stepId, null)}
          />
        </View>
      </ContentColumn>
    ),
    // `draft` actions are stable store functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, highlight, openSlider, toggleFolds, preview.baseChoices, previewItems],
  );

  const summary = plan
    ? draft.mode === 'forward'
      ? t('plan.bar.summaryNow', { readyDayTime })
      : t('plan.bar.summary', { dayTime: startDayTime, readyDayTime })
    : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('plan.title'),
          headerRight: () =>
            Platform.OS === 'ios' ? (
              <HeaderTextButton label={t('plan.cancel')} onPress={closeModal} />
            ) : null,
        }}
      />
      <FlashList
        ref={listRef}
        data={model.rows}
        renderItem={renderRow}
        keyExtractor={(row) => row.id}
        getItemType={(row) => row.type}
        extraData={`${highlight}|${openSlider}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xl }}
      />
      <BottomActionBar footnote={summary}>
        <Button
          size="lg"
          fullWidth
          label={t('plan.schedule')}
          onPress={() => {
            if (blocked) {
              explainBlocked(
                gone.length > 0 ? 'gone' : preview.status === 'invalid' ? 'invalid' : 'tooSoon',
              );
              return;
            }
            void save();
          }}
          loading={saving}
          accessibilityHint={
            gone.length > 0
              ? t('plan.cantSchedule.gone')
              : preview.status === 'tooSoon'
                ? t('plan.cantSchedule.tooSoon')
                : preview.status === 'invalid'
                  ? t('plan.cantSchedule.invalid')
                  : undefined
          }
          testID="schedule-bake"
        />
      </BottomActionBar>
      <TempSheet
        visible={tempOpen}
        current={draft.kitchenTempC}
        fallbackC={lastTemp}
        unit={settings.temperatureUnit}
        locale={locale}
        effectsFor={effectsFor}
        onSet={(c) => {
          draft.setKitchenTemp(c);
          setTempOpen(false);
        }}
        onClear={() => {
          draft.setKitchenTemp(null);
          setTempOpen(false);
        }}
        onClose={() => setTempOpen(false)}
      />
      <RecipeAddSheet
        visible={addOpen}
        recipes={recipes}
        taken={draft.items.map((i) => i.recipeId)}
        onClose={() => setAddOpen(false)}
        onPick={(recipe) => {
          draft.addItem({ recipeId: recipe.recipe.id, loaves: recipe.recipe.yieldLoaves });
          setAddOpen(false);
        }}
      />
    </View>
  );
}

function AddRecipeRow({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  if (disabled) return null;
  return (
    <ListRow
      testID="add-recipe"
      variant="action"
      accentTitle
      title={t('plan.multi.add')}
      onPress={onPress}
    />
  );
}

function SingleBlock({
  item,
  locale,
  costLine,
  incomplete,
}: {
  item: { draft: DraftItem; recipe: RecipeAggregate };
  locale: string;
  costLine: string | null;
  incomplete: boolean;
}) {
  const { space } = useTheme();
  const { recipe, ingredients } = item.recipe;
  const perLoafG =
    recipe.doughWeightG ??
    doughTotals(
      ingredients.map((i) => ({ id: i.id, name: i.name, role: i.role, amountG: i.amountG })),
    ).totalDoughG / recipe.yieldLoaves;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="title2" heading>
        {recipe.name}
      </Text>
      <Stepper
        testID="loaves-stepper"
        label={t('plan.loaves')}
        value={item.draft.loaves}
        min={1}
        max={MAX_LOAVES}
        onChange={(n) => {
          haptic('selection');
          useScheduleDraft.getState().setLoaves(item.draft.tempId, n);
        }}
        formatValue={(n) => loavesText(n)}
      />
      <Text variant="footnote" color="textSecondary">
        {t('plan.doughWeightNote', { weight: formatGrams(perLoafG, locale) })}
      </Text>
      {costLine ? <Text variant="footnote">{costLine}</Text> : null}
      {incomplete ? <StatusTag variant="unpriced" text={t('plan.costIncomplete')} /> : null}
    </View>
  );
}

function MultiBlock({
  live,
  costs,
  costLine,
  costIncomplete,
  totalLoaves,
  onRemove,
  onAdd,
}: {
  live: Array<{ draft: DraftItem; recipe: RecipeAggregate }>;
  costs: ItemCost[];
  costLine: (cost: ItemCost | undefined) => string | null;
  costIncomplete: (cost: ItemCost | undefined) => boolean;
  totalLoaves: number;
  onRemove: (tempId: string, name: string) => void;
  onAdd: () => void;
}) {
  const { space } = useTheme();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  return (
    <View style={{ gap: space.md }}>
      <SectionHeader
        title={t('plan.multi.recipes')}
        trailingText={tp('plan.multi.total', totalLoaves)}
      />
      {live.map((row, index) => {
        const name = row.recipe.recipe.name;
        const line = costLine(costs[index]);
        return (
          <View key={row.draft.tempId} style={{ gap: space.sm }} testID={`item-${index}`}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <LetterBadge letter={letterFor(index)} index={index} />
              <Text variant="headline" style={{ flex: 1 }} numberOfLines={2}>
                {name}
              </Text>
              <IconButton
                icon="more"
                accessibilityLabel={t('plan.multi.options', { recipe: name })}
                onPress={() => setMenuFor(menuFor === row.draft.tempId ? null : row.draft.tempId)}
                testID={`item-menu-${index}`}
              />
            </View>
            {menuFor === row.draft.tempId ? (
              <View>
                {index > 0 ? (
                  <ListRow
                    variant="action"
                    title={t('plan.multi.moveUp')}
                    onPress={() => {
                      useScheduleDraft.getState().moveItem(row.draft.tempId, -1);
                      AccessibilityInfo.announceForAccessibility(
                        t('plan.multi.moved', { recipe: name, letter: letterFor(index - 1) }),
                      );
                      setMenuFor(null);
                    }}
                  />
                ) : null}
                {index < live.length - 1 ? (
                  <ListRow
                    variant="action"
                    title={t('plan.multi.moveDown')}
                    onPress={() => {
                      useScheduleDraft.getState().moveItem(row.draft.tempId, 1);
                      AccessibilityInfo.announceForAccessibility(
                        t('plan.multi.moved', { recipe: name, letter: letterFor(index + 1) }),
                      );
                      setMenuFor(null);
                    }}
                  />
                ) : null}
                <ListRow
                  variant="destructive"
                  title={t('plan.multi.remove')}
                  testID={`item-remove-${index}`}
                  onPress={() => {
                    setMenuFor(null);
                    onRemove(row.draft.tempId, name);
                  }}
                />
              </View>
            ) : null}
            {line ? <Text variant="footnote">{line}</Text> : null}
            {costIncomplete(costs[index]) ? (
              <StatusTag variant="unpriced" text={t('plan.costIncomplete')} />
            ) : null}
            <Stepper
              testID={`loaves-stepper-${index}`}
              label={`${t('plan.loaves')}, ${name}`}
              value={row.draft.loaves}
              min={1}
              max={MAX_LOAVES}
              onChange={(n) => {
                haptic('selection');
                useScheduleDraft.getState().setLoaves(row.draft.tempId, n);
              }}
              formatValue={(n) => loavesText(n)}
            />
          </View>
        );
      })}
      <Text variant="footnote" color="textSecondary">
        {t('plan.doughWeightNoteMulti')}
      </Text>
      {live.length < MAX_RECIPES_PER_BAKE ? (
        <ListRow
          testID="add-recipe"
          variant="action"
          accentTitle
          title={t('plan.multi.add')}
          onPress={onAdd}
        />
      ) : null}
    </View>
  );
}
