import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { clock, useNow } from '../../../lib/clock';
import { t } from '../../../lib/i18n';
import { routes } from '../../../lib/nav';
import {
  ActionSheet,
  BottomActionBar,
  Button,
  ContentColumn,
  EmptyState,
  Fab,
  FAB_CLEARANCE,
  SectionHeader,
  Skeleton,
} from '../../../ui/components';
import { useLocale } from '../../../ui/hooks/useLocale';
import { useTheme } from '../../../ui/theme';
import type { BakeAggregate } from '../../../db/types';
import { ReminderBanners } from '../../notifications/components/ReminderBanners';
import { deriveBakeLive, type BakeLive } from '../derive';
import { cardFor, type CardReminders } from '../card';
import { useBakeLifecycle } from '../hooks/useBakeLifecycle';
import { usePermissions } from '../../notifications/store';
import { useActiveBakes, useSweepBakes } from '../hooks/useLiveData';
import { ActiveBakeCard } from './ActiveBakeCard';

type Row =
  | { type: 'header'; id: string; title: string }
  | { type: 'bake'; id: string; aggregate: BakeAggregate; live: BakeLive };

/** Sections "Now" and "Upcoming" (screens-bake.md 1.1). Overtime first, then the soonest end. */
export function sectionRows(
  bakes: readonly BakeAggregate[],
  now: number,
): { rows: Row[]; hasNow: boolean; hasUpcoming: boolean } {
  const derived = bakes.map((aggregate) => ({ aggregate, live: deriveBakeLive(aggregate, now) }));
  const current = derived
    .filter((d) => d.live.phase !== 'waiting')
    .sort((a, b) => {
      const rank = (d: { live: BakeLive }) => (d.live.overtimeCount > 0 ? 0 : 1);
      const end = (d: { live: BakeLive }) => d.live.urgent?.targetAt ?? d.live.readyAt;
      return rank(a) - rank(b) || end(a) - end(b);
    });
  const upcoming = derived
    .filter((d) => d.live.phase === 'waiting')
    .sort((a, b) => a.live.startAt - b.live.startAt);
  const rows: Row[] = [];
  if (current.length > 0) {
    rows.push({ type: 'header', id: 'h-now', title: t('home.section.now') });
    for (const d of current) rows.push({ type: 'bake', id: d.aggregate.bake.id, ...d });
  }
  if (upcoming.length > 0) {
    rows.push({ type: 'header', id: 'h-upcoming', title: t('home.section.upcoming') });
    for (const d of upcoming) rows.push({ type: 'bake', id: d.aggregate.bake.id, ...d });
  }
  return { rows, hasNow: current.length > 0, hasUpcoming: upcoming.length > 0 };
}

/** BAKES-HOME: every scheduled and active bake, and one way in to schedule another. */
export function BakesHomeScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const { locale } = useLocale();
  const now = useNow(30_000);
  const query = useActiveBakes();
  const { finishBake, cancelBake } = useBakeLifecycle({ closeScreen: false });
  const [menuFor, setMenuFor] = useState<{ aggregate: BakeAggregate; live: BakeLive } | null>(null);
  useSweepBakes();
  const notifications = usePermissions((s) => s.notifications);
  const exactAlarm = usePermissions((s) => s.exactAlarm);
  const reminders: CardReminders =
    notifications === 'denied' || notifications === 'undetermined'
      ? 'off'
      : exactAlarm === 'denied'
        ? 'late'
        : null;

  const zone = clock.zone();
  const ctx = useMemo(() => ({ zone, locale, now }), [zone, locale, now]);
  const { rows } = useMemo(() => sectionRows(query.data ?? [], now), [query.data, now]);

  const schedule = useCallback(() => router.push(routes.schedulePick), [router]);
  const open = useCallback((id: string) => router.push(routes.bake(id)), [router]);

  const empty = query.isSuccess && query.data.length === 0;
  const ios = Platform.OS === 'ios';

  let body;
  if (query.isPending) {
    body = <Skeleton variant="card" testID="home-loading" />;
  } else if (query.isError) {
    body = (
      <EmptyState
        variant="error"
        title={t('home.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void query.refetch() }}
        testID="home-error"
      />
    );
  } else if (empty) {
    body = (
      <EmptyState
        variant="firstUse"
        icon="timer"
        title={t('home.empty.title')}
        body={t('home.empty.body')}
        action={{ label: t('home.schedule'), onPress: schedule }}
        testID="home-empty"
      />
    );
  } else {
    body = (
      <FlashList
        data={rows}
        ListHeaderComponent={
          <ContentColumn style={{ paddingTop: space.sm }}>
            <ReminderBanners />
          </ContentColumn>
        }
        keyExtractor={(row) => row.id}
        getItemType={(row) => row.type}
        contentContainerStyle={{
          paddingBottom: (ios ? space.xxxl + space.huge : FAB_CLEARANCE) + space.lg,
        }}
        renderItem={({ item: row }) =>
          row.type === 'header' ? (
            <SectionHeader title={row.title} />
          ) : (
            <ContentColumn style={{ paddingVertical: space.sm }}>
              <ActiveBakeCard
                testID={`bake-card-${row.id}`}
                model={cardFor(row.aggregate, row.live, ctx, reminders)}
                onPress={() => open(row.id)}
                onLongPress={() => setMenuFor({ aggregate: row.aggregate, live: row.live })}
                actions={cardActions(row.live)}
                onAction={(name) => runAction(name, row.aggregate)}
              />
            </ContentColumn>
          )
        }
      />
    );
  }

  function cardActions(live: BakeLive) {
    return [
      { name: 'open', label: t('home.menu.open') },
      ...(live.phase === 'ready' ? [{ name: 'finish', label: t('home.menu.finish') }] : []),
      { name: 'cancel', label: t('home.menu.cancel') },
    ];
  }

  function runAction(name: string, aggregate: BakeAggregate) {
    if (name === 'open') open(aggregate.bake.id);
    else if (name === 'finish') void finishBake(aggregate);
    else if (name === 'cancel') void cancelBake(aggregate);
  }

  const menuTitle = menuFor
    ? menuFor.aggregate.items.map((i) => i.recipeSnapshot.recipe.name).join(', ')
    : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('home.title'), headerLargeTitle: ios }} />
      <View style={{ flex: 1 }}>{body}</View>
      {/* The empty state has its own button, so the pinned one would duplicate it. */}
      {!empty && !query.isPending && !query.isError ? (
        ios ? (
          <BottomActionBar insideTabs>
            <Button
              size="lg"
              fullWidth
              label={t('home.schedule')}
              onPress={schedule}
              testID="home-schedule"
            />
          </BottomActionBar>
        ) : (
          <Fab label={t('home.schedule')} onPress={schedule} testID="home-schedule" />
        )
      ) : null}
      <ActionSheet
        title={menuTitle}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? cardActions(menuFor.live).map((action) => ({
                label: action.label,
                destructive: action.name === 'cancel',
                onPress: () => runAction(action.name, menuFor.aggregate),
              }))
            : []
        }
      />
    </View>
  );
}
