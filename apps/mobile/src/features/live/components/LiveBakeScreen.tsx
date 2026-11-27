import { hourCycleOption } from '../../../lib/hourCycle';
import { Stack, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { fromIso } from '@sourdough/core';
import type { BakeAggregate } from '../../../db/types';
import { clock, useNow } from '../../../lib/clock';
import { t } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { useRepositories } from '../../../state/repositories';
import { showSnackbar } from '../../../state/snackbar';
import {
  ActionSheet,
  Banner,
  BottomActionBar,
  Button,
  ContentColumn,
  EmptyState,
  Icon,
  IconButton,
  Skeleton,
  Text,
} from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import { useLocale } from '../../../ui/hooks/useLocale';
import { useScreenMargin } from '../../../ui/hooks/useScreenMargin';
import { useTheme } from '../../../ui/theme';
import { formatDuration } from '../../recipes/format';
import { useScheduleSettings } from '../../schedule/hooks/useScheduleSettings';
import { ReminderBanners } from '../../notifications/components/ReminderBanners';
import { completeSummary } from '../complete';
import { deriveBakeLive, openItems, type ItemLive } from '../derive';
import { useBakeLifecycle } from '../hooks/useBakeLifecycle';
import { useKeepAwakeSetting, useKeepAwakeWhile } from '../hooks/useKeepAwake';
import { useLiveActions } from '../hooks/useLiveActions';
import { useActiveBakes, useLiveBake, useSweepBakes } from '../hooks/useLiveData';
import { heroFor, labelFor, panelFor, type HeroModel } from '../panel';
import { ovenConflictText, readyMovedModels, type TimeCtx } from '../ready';
import { useLiveUi } from '../store';
import { CurrentStepPanel } from './CurrentStepPanel';
import { FinishedAtSheet } from './FinishedAtSheet';
import { IngredientsSheet } from './IngredientsSheet';
import { AlsoNowSection, ComingUpSection, useFocusRefs } from './LiveSections';
import { OtherBakeChip } from './OtherBakeChip';

const PREVIEW_ROWS = 3;
const MIN_MS = 60_000;
const KEEP_AWAKE_HINT_KEY = 'liveKeepAwakeHintShown';

export interface LiveBakeScreenProps {
  id: string;
  /** `?step=<bakeStepId>`: focus only, never a write. */
  step?: string;
}

/** BAKE-LIVE (screens-bake.md section 8): a glanceable view with one large tap to say it's done. */
export function LiveBakeScreen({ id, step }: LiveBakeScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { locale } = useLocale();
  const query = useLiveBake(id);
  const others = useActiveBakes();
  const settings = useScheduleSettings();
  const now = useNow(10_000);
  const zone = clock.zone();
  useSweepBakes();

  const aggregate = query.data ?? null;
  const live = useMemo(() => (aggregate ? deriveBakeLive(aggregate, now) : null), [aggregate, now]);
  const ctx: TimeCtx = useMemo(() => ({ zone, locale, now }), [zone, locale, now]);
  // The spoken labels refresh once a minute, never each second (screens-bake.md 8.11).
  const minute = Math.floor(now / MIN_MS) * MIN_MS;
  const minuteCtx: TimeCtx = useMemo(() => ({ zone, locale, now: minute }), [zone, locale, minute]);

  const actions = useLiveActions(aggregate, live);
  const lifecycle = useBakeLifecycle({ closeScreen: true });
  const dismissed = useLiveUi((s) => s.dismissedReady);
  const dismissReady = useLiveUi((s) => s.dismissReady);

  const [keepAwake, setKeepAwake] = useKeepAwakeSetting();
  const open =
    aggregate !== null &&
    (aggregate.bake.status === 'active' || aggregate.bake.status === 'scheduled');
  useKeepAwakeWhile(keepAwake && open);

  const [menuOpen, setMenuOpen] = useState(false);
  const [ingredientsFor, setIngredientsFor] = useState<string | null>(null);
  const [finishedFor, setFinishedFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.bakes);
  }, [router]);

  // First time the screen stays on, say so (screens-bake.md 8.7).
  const { meta } = useRepositories();
  useEffect(() => {
    if (!keepAwake || !open) return;
    let alive = true;
    meta
      .get(KEEP_AWAKE_HINT_KEY)
      .then(async (seen) => {
        if (!alive || seen) return;
        await meta.set(KEEP_AWAKE_HINT_KEY, '1');
        showSnackbar({ message: t('live.keepAwake.first') });
      })
      .catch((error: unknown) => logger.warn('live.hint_failed', { code: error ? 1 : 0 }));
    return () => {
      alive = false;
    };
  }, [keepAwake, open, meta]);

  // Overtime that begins while the screen is visible: one buzz and one announcement.
  const overtimeSeen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!live || !aggregate) return;
    const current = new Set(live.items.filter((i) => i.phase === 'overtime').map((i) => i.itemId));
    const previous = overtimeSeen.current;
    overtimeSeen.current = current;
    if (previous === null) return;
    for (const item of live.items) {
      if (current.has(item.itemId) && !previous.has(item.itemId) && item.current) {
        haptic('warning');
        AccessibilityInfo.announceForAccessibility(
          t('live.announce.overtime', { step: labelFor(aggregate, item.current) }),
        );
      }
    }
  }, [live, aggregate]);

  // --- the linked step (?step=) -------------------------------------------------------------
  const focusId = useMemo(() => {
    if (!step || !live) return null;
    return live.timeline.some((e) => e.step.id === step) ? step : null;
  }, [step, live]);
  const { nodes, focusRef } = useFocusRefs();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const layouts = useRef<{
    section: number | null;
    rows: Map<string, number>;
    panels: Map<string, number>;
  }>({
    section: null,
    rows: new Map(),
    panels: new Map(),
  });
  const scrolled = useRef(false);
  const expandedForFocus = useRef(false);

  const panelOwner = useMemo(
    () => live?.items.find((i) => i.current?.id === focusId) ?? null,
    [live, focusId],
  );
  const comingEntries = useMemo(() => {
    if (!live) return [];
    const shown = new Set(live.items.map((i) => i.current?.id));
    const alsoIds = new Set(live.alsoNow.map((s) => s.id));
    return live.timeline.filter(
      (e) => e.state === 'upcoming' && !shown.has(e.step.id) && !alsoIds.has(e.step.id),
    );
  }, [live]);
  const allEntries = useMemo(() => live?.timeline ?? [], [live]);

  // A linked step beyond the preview opens the full list once.
  useEffect(() => {
    if (!focusId || expandedForFocus.current || panelOwner) return;
    expandedForFocus.current = true;
    const index = comingEntries.findIndex((e) => e.step.id === focusId);
    if (index < 0 || index >= PREVIEW_ROWS) setExpanded(true);
  }, [focusId, panelOwner, comingEntries]);

  const tryScroll = useCallback(() => {
    if (!focusId || scrolled.current) return;
    const l = layouts.current;
    let y: number | null = null;
    if (panelOwner) y = l.panels.get(panelOwner.itemId) ?? null;
    else if (l.section !== null && l.rows.has(focusId)) y = l.section + (l.rows.get(focusId) ?? 0);
    if (y === null) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - theme.space.lg), animated: false });
    const node = nodes.current.get(focusId);
    const handle = node ? findNodeHandle(node) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [focusId, panelOwner, nodes, theme.space.lg]);

  useEffect(() => {
    scrolled.current = false;
    expandedForFocus.current = false;
  }, [focusId]);

  // --- derived screen content ---------------------------------------------------------------
  const quiet = settings.quiet;
  const unit = settings.temperatureUnit;
  const readyCards = useMemo(
    () =>
      aggregate && live
        ? readyMovedModels(aggregate, live, minuteCtx).filter((m) => !dismissed.has(m.dismissKey))
        : [],
    [aggregate, live, minuteCtx, dismissed],
  );
  const conflict = useMemo(
    () => (aggregate && live ? ovenConflictText(aggregate, live, minuteCtx) : null),
    [aggregate, live, minuteCtx],
  );

  const { width, height } = useWindowDimensions();
  const { stacked } = useFontScale();
  const margin = useScreenMargin();
  const wide = width > height || width >= theme.layout.wideBreakpoint;
  const ios = Platform.OS === 'ios';
  const [barHeight, setBarHeight] = useState(0);

  // --- header -------------------------------------------------------------------------------
  const title = aggregate
    ? aggregate.items.map((i) => i.recipeSnapshot.recipe.name).join(', ')
    : '';
  const toggleKeepAwake = () => {
    haptic('selection');
    setKeepAwake(!keepAwake);
  };
  const headerOptions = {
    title,
    headerBackVisible: false,
    headerLeft: () => (
      <IconButton
        testID="live-back"
        tier="kitchen"
        icon={ios ? 'chevronDown' : 'arrowBack'}
        accessibilityLabel={t('live.back')}
        onPress={back}
      />
    ),
    headerRight: () =>
      open ? (
        <View style={{ flexDirection: 'row' }}>
          <IconButton
            testID="live-keep-awake"
            tier="kitchen"
            variant="toggle"
            icon="sun"
            selected={keepAwake}
            accessibilityLabel={t('live.keepAwake')}
            onPress={toggleKeepAwake}
          />
          <IconButton
            testID="live-more"
            tier="kitchen"
            icon="more"
            accessibilityLabel={t('live.more')}
            onPress={() => setMenuOpen(true)}
          />
        </View>
      ) : null,
  };

  // --- states without a live bake -----------------------------------------------------------
  let early: ReactNode = null;
  if (query.isPending) {
    early = <Skeleton variant="panel" testID="live-loading" />;
  } else if (query.isError) {
    early = (
      <EmptyState
        variant="error"
        title={t('live.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void query.refetch() }}
        secondaryAction={{ label: t('live.back'), onPress: back }}
        testID="live-error"
      />
    );
  } else if (!aggregate) {
    early = (
      <EmptyState
        variant="error"
        title={t('live.gone.missing')}
        action={{ label: t('live.back'), onPress: back }}
        testID="live-gone"
      />
    );
  } else if (aggregate.bake.status === 'cancelled') {
    early = (
      <EmptyState
        variant="error"
        title={t('live.gone.cancelled')}
        action={{ label: t('live.back'), onPress: back }}
        testID="live-gone"
      />
    );
  }
  if (early || !aggregate || !live) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={headerOptions} />
        {early}
      </View>
    );
  }

  // --- complete -----------------------------------------------------------------------------
  if (aggregate.bake.status === 'completed') {
    const summary = completeSummary(aggregate, ctx);
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={headerOptions} />
        <ScrollView contentContainerStyle={{ paddingVertical: theme.space.xl }}>
          <ContentColumn style={{ alignItems: 'center', gap: theme.space.md }}>
            <Icon name="checkCircle" size={theme.size.iconHero} color="success" />
            <Text
              variant="title1"
              heading
              style={{ textAlign: 'center' }}
              testID="live-complete-title"
            >
              {t('live.complete.title')}
            </Text>
            <Text color="textSecondary" style={{ textAlign: 'center' }}>
              {summary.body}
            </Text>
            {summary.costLines.map((line) => (
              <Text key={line.name ?? 'cost'} variant="headline" style={{ textAlign: 'center' }}>
                {line.name ? `${line.name}: ${line.text}` : line.text}
              </Text>
            ))}
          </ContentColumn>
        </ScrollView>
        <BottomActionBar>
          <Button
            size="lg"
            fullWidth
            label={t('live.complete.back')}
            onPress={back}
            testID="live-back-bar"
          />
        </BottomActionBar>
      </View>
    );
  }

  // --- live ---------------------------------------------------------------------------------
  const active = openItems(live);
  const multi = live.items.length > 1;
  const panelsCompact = active.length > 1;
  const otherBake = otherBakeChip(others.data ?? [], aggregate.bake.id, ctx);
  const showIngredients = aggregate.items.some((i) => i.recipeSnapshot.ingredients.length > 0);

  const heroButton = (item: ItemLive, hero: HeroModel) => (
    <Button
      key={`hero-${item.itemId}`}
      testID={`hero-${item.itemId}`}
      variant={hero.variant}
      size={hero.size}
      fullWidth
      label={hero.label}
      accessibilityLabel={hero.a11yLabel}
      busy={actions.busy}
      onPress={() => void actions.onHero(item, hero)}
    />
  );

  const secondaryRow = (item: ItemLive) => {
    const current = item.current;
    if (!current) return null;
    const isWeighing = current.kind === 'feed' || current.kind === 'mix';
    const running = item.phase === 'running' || item.phase === 'overtime';
    const canExtend = running && !item.isFinal && !current.foldCount;
    const skipFolds =
      running && item.fold !== null && item.fold.next !== null && item.next !== null;
    const buttons: ReactNode[] = [];
    if (showIngredients) {
      buttons.push(
        <Button
          key="ingredients"
          testID={`ingredients-${item.itemId}`}
          variant={isWeighing ? 'tonal' : 'outline'}
          size="lg"
          label={t('live.ingredients')}
          onPress={() => setIngredientsFor(item.itemId)}
        />,
      );
    }
    const extend = canExtend ? (
      <Button
        key="extend"
        testID={`extend-${item.itemId}`}
        variant="outline"
        size="lg"
        label={t('live.extend')}
        accessibilityLabel={multi ? `${t('live.extend')}, ${item.name}` : t('live.extend')}
        disabled={actions.busy}
        onPress={() => void actions.onExtend(item)}
      />
    ) : null;
    // Weighing steps put Ingredients first; everywhere else +15 min leads.
    const ordered = isWeighing ? [...buttons, extend] : [extend, ...buttons];
    return (
      <View key={`secondary-${item.itemId}`} style={{ gap: theme.space.sm }}>
        <View
          style={{
            flexDirection: stacked ? 'column' : 'row',
            flexWrap: 'wrap',
            gap: theme.space.sm,
            alignItems: stacked ? 'stretch' : 'flex-start',
          }}
        >
          {ordered}
        </View>
        {skipFolds && item.next ? (
          <Button
            variant="text"
            size="lg"
            label={t('live.fold.skipToNext', { next: labelFor(aggregate, item.next) })}
            disabled={actions.busy}
            onPress={() => void actions.onSkipFolds(item)}
            testID={`skip-folds-${item.itemId}`}
          />
        ) : null}
      </View>
    );
  };

  const panelBlock = (item: ItemLive) => {
    const model = panelFor(aggregate, item, minuteCtx, quiet, unit);
    // The countdown itself is exact; only the spoken label is minute-stale.
    const exact = panelFor(aggregate, item, ctx, quiet, unit);
    const hero = heroFor(aggregate, item, multi);
    return (
      <View
        key={`panel-${item.itemId}`}
        onLayout={(e: LayoutChangeEvent) => {
          layouts.current.panels.set(item.itemId, e.nativeEvent.layout.y);
          tryScroll();
        }}
        style={{ gap: theme.space.lg, marginBottom: panelsCompact ? theme.space.xxl : 0 }}
      >
        <CurrentStepPanel
          model={{ ...exact, a11yLabel: model.a11yLabel }}
          item={item}
          compact={panelsCompact}
          showRecipe={multi}
          locale={locale}
          highlighted={panelOwner?.itemId === item.itemId}
          onFinishedEarlier={() => setFinishedFor(item.itemId)}
        />
        {panelsCompact && hero ? (
          <>
            {secondaryRow(item)}
            {heroButton(item, hero)}
          </>
        ) : null}
      </View>
    );
  };

  const doneRows = live.items
    .filter((i) => i.phase === 'done')
    .map((item) => (
      <View
        key={`done-${item.itemId}`}
        accessible
        testID={`item-done-${item.itemId}`}
        accessibilityLabel={t('live.itemDone', {
          letter: item.letter,
          recipe: item.name,
          time: item.doneAt
            ? new Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                ...hourCycleOption(),
                minute: '2-digit',
                timeZone: zone,
              }).format(item.doneAt)
            : '',
        })}
        style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' }}
      >
        <Icon name="check" color="success" />
        <Text variant="headline" style={{ flexShrink: 1 }}>
          {t('live.itemDone', {
            letter: item.letter,
            recipe: item.name,
            time: item.doneAt
              ? new Intl.DateTimeFormat(locale, {
                  hour: 'numeric',
                  ...hourCycleOption(),
                  minute: '2-digit',
                  timeZone: zone,
                }).format(item.doneAt)
              : '',
          })}
        </Text>
      </View>
    ));

  const banners = (
    <>
      <ReminderBanners tier="kitchen" />
      {readyCards.map((card) => (
        <Banner
          key={card.dismissKey}
          testID={`ready-moved-${card.itemId}`}
          tier="kitchen"
          variant={card.variant}
          announceKey={`ready:${card.dismissKey}`}
          dismissLabel={t('live.readyMoved.dismiss')}
          message={card.line ? `${card.message}\n${card.line}` : card.message}
          actions={
            card.hold
              ? [
                  {
                    label: multi
                      ? t('live.hold.actionFor', { recipe: card.recipe })
                      : t('live.hold.action'),
                    hint: card.hold.hint,
                    onPress: () => void actions.onHold(card.hold!),
                  },
                ]
              : []
          }
          onDismiss={() => dismissReady(card.dismissKey)}
        />
      ))}
      {conflict ? (
        <Banner
          testID="oven-conflict"
          tier="kitchen"
          variant="warning"
          announceKey={`conflict:${aggregate.bake.id}:${conflict}`}
          message={conflict}
        />
      ) : null}
    </>
  );

  const stale = active.some((i) => i.phase === 'overtime' && i.overMs >= 60 * MIN_MS);
  const canExpand = allEntries.length > Math.min(comingEntries.length, PREVIEW_ROWS);
  const comingShown = expanded ? allEntries : comingEntries.slice(0, PREVIEW_ROWS);
  const comingUp = (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        layouts.current.section = e.nativeEvent.layout.y;
        tryScroll();
      }}
    >
      <ComingUpSection
        entries={comingShown}
        aggregate={aggregate}
        ctx={minuteCtx}
        quiet={quiet}
        multi={multi}
        expanded={expanded}
        canExpand={canExpand}
        onToggle={() => setExpanded((v) => !v)}
        highlightId={focusId}
        onRowLayout={(rowId, y) => {
          layouts.current.rows.set(rowId, y);
          tryScroll();
        }}
        focusRef={focusRef}
        stale={stale}
      />
    </View>
  );

  const also = (
    <AlsoNowSection
      rows={live.alsoNow}
      aggregate={aggregate}
      ctx={minuteCtx}
      multi={multi}
      busy={actions.busy}
      onDone={(row) => void actions.onAlsoDone(row)}
    />
  );

  const chip = otherBake ? (
    <OtherBakeChip
      text={otherBake.text}
      accessibilityLabel={otherBake.label}
      onPress={() => (otherBake.id ? actions.openBake(otherBake.id) : router.replace(routes.bakes))}
    />
  ) : null;

  // The pinned hero: one open item (or the lone "Finish bake" when every item is done).
  const single = active.length === 1 ? (active[0] as ItemLive) : null;
  const singleHero = single ? heroFor(aggregate, single, false) : null;
  const finishOnly = active.length === 0;

  const gutter = { gap: theme.space.lg };
  const leftContent = (
    <View style={gutter}>
      {active.map(panelBlock)}
      {doneRows}
    </View>
  );
  // Landscape right column: the hero comes first, then the secondary row, then everything else
  // (screens-bake.md 8.9), so two banners can never push Done below the fold (DR2-08).
  const wideTop = (
    <View style={gutter}>
      {single && singleHero ? heroButton(single, singleHero) : null}
      {!panelsCompact && single ? secondaryRow(single) : null}
    </View>
  );
  const chipAndBanners = (
    <View style={gutter}>
      {chip}
      {banners}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={headerOptions} />
      {wide ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            gap: theme.space.huge,
            paddingLeft: margin.left,
            paddingRight: margin.right,
          }}
        >
          <ScrollView
            style={{ flex: 11 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingVertical: theme.space.lg,
            }}
          >
            {leftContent}
          </ScrollView>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 9 }}
            contentContainerStyle={{ gap: theme.space.lg, paddingVertical: theme.space.lg }}
          >
            {wideTop}
            {also}
            {chipAndBanners}
            {comingUp}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingVertical: theme.space.lg,
            paddingBottom: barHeight + theme.space.lg,
          }}
        >
          <ContentColumn style={{ gap: theme.space.lg }}>
            {chip}
            {banners}
            {leftContent}
            {!panelsCompact && single ? secondaryRow(single) : null}
          </ContentColumn>
          {also}
          {comingUp}
        </ScrollView>
      )}
      {!wide && single && singleHero ? (
        <BottomActionBar onHeightChange={setBarHeight}>
          {heroButton(single, singleHero)}
        </BottomActionBar>
      ) : null}
      {finishOnly ? (
        <BottomActionBar onHeightChange={setBarHeight}>
          <Button
            size="hero"
            fullWidth
            label={t('live.finish')}
            onPress={() => void lifecycle.finishBake(aggregate)}
            testID="live-finish-only"
          />
        </BottomActionBar>
      ) : null}
      <ActionSheet
        title={menuOpen ? title : null}
        onClose={() => setMenuOpen(false)}
        actions={[
          ...(showIngredients
            ? [
                {
                  label: t('live.menu.ingredients'),
                  onPress: () =>
                    setIngredientsFor(active[0]?.itemId ?? aggregate.items[0]?.id ?? null),
                },
              ]
            : []),
          {
            label: t('live.menu.keepAwake', {
              state: t(keepAwake ? 'live.menu.on' : 'live.menu.off'),
            }),
            onPress: toggleKeepAwake,
          },
          { label: t('live.menu.finish'), onPress: () => void lifecycle.finishBake(aggregate) },
          {
            label: t('live.menu.cancel'),
            destructive: true,
            onPress: () => void lifecycle.cancelBake(aggregate),
          },
        ]}
      />
      {ingredientsFor ? (
        <IngredientsSheet
          key={ingredientsFor}
          visible
          onClose={() => setIngredientsFor(null)}
          aggregate={aggregate}
          locale={locale}
          initialItemId={ingredientsFor}
        />
      ) : null}
      <FinishedAtSheet
        visible={finishedFor !== null}
        onClose={() => setFinishedFor(null)}
        item={live.items.find((i) => i.itemId === finishedFor) ?? null}
        aggregate={aggregate}
        ctx={ctx}
        onConfirm={actions.onFinishedAt}
      />
    </View>
  );
}

/**
 * "Other bake: Whole wheat · Shape in 42 min": the other bake's NEXT step and when it starts, or
 * "Shape is over time" when it is late (DR2-01). Overtime bakes come first.
 */
export function otherBakeChip(
  bakes: readonly BakeAggregate[],
  currentId: string,
  ctx: TimeCtx,
): { id: string | null; text: string; label: string; overtime: boolean } | null {
  const candidates = bakes
    .filter((b) => b.bake.id !== currentId)
    .map((aggregate) => {
      const live = deriveBakeLive(aggregate, ctx.now);
      const late = live.items.find((i) => i.phase === 'overtime');
      const row = late?.current ?? (live.phase === 'waiting' ? live.first : live.next);
      const at = row ? fromIso(row.plannedStartAt) : live.readyAt;
      return { aggregate, live, row, at, over: late !== undefined };
    })
    .filter((c) => c.row && (c.over || c.live.phase !== 'waiting' || c.at - ctx.now <= 60 * MIN_MS))
    .sort((a, b) => Number(b.over) - Number(a.over) || a.at - b.at);
  const first = candidates[0];
  if (!first || !first.row) return null;
  const step = labelFor(first.aggregate, first.row);
  const duration = formatDuration(
    Math.max(1, Math.ceil((first.at - ctx.now) / MIN_MS)),
    ctx.locale,
  );
  if (candidates.length === 1) {
    const recipe = first.aggregate.items.map((i) => i.recipeSnapshot.recipe.name).join(', ');
    return {
      id: first.aggregate.bake.id,
      overtime: first.over,
      text: first.over
        ? t('live.other.over', { recipe, step })
        : t('live.other.one', { recipe, step, duration }),
      label: first.over
        ? t('live.other.overLabel', { recipe, step })
        : t('live.other.label', { recipe, step, duration }),
    };
  }
  return {
    id: null,
    overtime: first.over,
    text: t('live.other.many', { count: candidates.length, step, duration }),
    label: t('live.other.manyLabel', { count: candidates.length }),
  };
}
