import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { RecipeAggregate } from '../../../db/types';
import { t, tp } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { showSnackbar } from '../../../state/snackbar';
import {
  BottomActionBar,
  Button,
  EmptyState,
  HeaderTextButton,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
  Stepper,
} from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useLocale } from '../../../ui/hooks/useLocale';
import { useScreenMargin } from '../../../ui/hooks/useScreenMargin';
import { useTheme } from '../../../ui/theme';
import { useScreenSearch } from '../../../ui/useScreenSearch';
import { loavesText } from '../../recipes/format';
import { useAddStarterRecipes, useRecipeAggregates } from '../../recipes/hooks/useRecipeData';
import { useRecentRecipeIds } from '../hooks/useScheduleData';
import { MAX_RECIPES_PER_BAKE, letterFor } from '../labels';
import { alertCantSchedule, pickRowInfo, type PickRowInfo } from '../pickRows';
import { useScheduleDraft, type Selection } from '../store';
import { useCloseScheduleModal } from '../useCloseScheduleModal';
import { useScheduleCloseGuard } from '../useScheduleCloseGuard';
import { LetterBadge } from './LetterBadge';

type ListItem =
  { type: 'header'; id: string; title: string } | { type: 'row'; id: string; info: PickRowInfo };

/** SCHED-PICK (screens-bake.md section 2): one tap for a single recipe, or a multi-select. */
export function SchedulePickScreen() {
  const router = useRouter();
  const closeModal = useCloseScheduleModal();
  const { space } = useTheme();
  const margin = useScreenMargin();
  const { locale } = useLocale();
  const recipes = useRecipeAggregates();
  const recent = useRecentRecipeIds();
  const addStarters = useAddStarterRecipes();
  const search = useScreenSearch(t('pick.search'));
  const [multi, setMulti] = useState(false);
  const [selection, setSelection] = useState<Selection[]>([]);
  useScheduleCloseGuard();

  const infos = useMemo(
    () =>
      (recipes.data ?? [])
        .map((r) => ({ aggregate: r, info: pickRowInfo(r, locale) }))
        .sort((a, b) => a.info.name.localeCompare(b.info.name, locale)),
    [recipes.data, locale],
  );
  const byId = useMemo(() => new Map(infos.map((x) => [x.info.id, x])), [infos]);

  const items: ListItem[] = useMemo(() => {
    const needle = search.query.trim().toLocaleLowerCase();
    const visible = infos.filter(
      (x) => !needle || x.info.name.toLocaleLowerCase().includes(needle),
    );
    const favorites = visible.filter((x) => x.info.favorite);
    const favIds = new Set(favorites.map((x) => x.info.id));
    const recentRows = (recent.data ?? [])
      .map((id) => byId.get(id))
      .filter(
        (x): x is (typeof infos)[number] => !!x && visible.includes(x) && !favIds.has(x.info.id),
      );
    const used = new Set([...favIds, ...recentRows.map((x) => x.info.id)]);
    const rest = visible.filter((x) => !used.has(x.info.id));
    const out: ListItem[] = [];
    const section = (id: string, title: string, rows: typeof visible) => {
      if (rows.length === 0) return;
      out.push({ type: 'header', id: `h:${id}`, title });
      rows.forEach((x) => out.push({ type: 'row', id: x.info.id, info: x.info }));
    };
    section('fav', t('pick.section.favorites'), favorites);
    section('recent', t('pick.section.recent'), recentRows);
    section('all', t('pick.section.all'), rest);
    return out;
  }, [infos, byId, recent.data, search.query]);

  const editRecipe = useCallback((id: string) => router.push(routes.recipeEditor(id)), [router]);

  const chooseSingle = (aggregate: RecipeAggregate, info: PickRowInfo) => {
    if (!info.schedulable) {
      alertCantSchedule(info, () => editRecipe(info.id));
      return;
    }
    const draft = useScheduleDraft.getState();
    const same = draft.items.length === 1 && draft.items[0]?.recipeId === info.id;
    if (!same) draft.reset();
    draft.setSelection([
      {
        recipeId: info.id,
        loaves: same ? (draft.items[0]?.loaves ?? 1) : aggregate.recipe.yieldLoaves,
      },
    ]);
    router.push(routes.schedulePlan());
  };

  const toggle = (aggregate: RecipeAggregate, info: PickRowInfo) => {
    if (!info.schedulable) {
      alertCantSchedule(info, () => editRecipe(info.id));
      return;
    }
    const index = selection.findIndex((s) => s.recipeId === info.id);
    if (index >= 0) {
      setSelection(selection.filter((s) => s.recipeId !== info.id));
    } else if (selection.length >= MAX_RECIPES_PER_BAKE) {
      showSnackbar({ message: t('pick.max') });
      return;
    } else {
      setSelection([...selection, { recipeId: info.id, loaves: aggregate.recipe.yieldLoaves }]);
    }
    haptic('selection');
  };

  const setMode = (next: boolean) => {
    setMulti(next);
    setSelection([]);
    AccessibilityInfo.announceForAccessibility(t(next ? 'pick.mode.multi' : 'pick.mode.single'));
  };

  const continueWith = () => {
    if (selection.length === 0) return;
    useScheduleDraft.getState().setSelection(selection);
    router.push(routes.schedulePlan());
  };

  const totalLoaves = selection.reduce((n, s) => n + s.loaves, 0);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') return <SectionHeader title={item.title} />;
    const { info } = item;
    const entry = byId.get(info.id);
    if (!entry) return null;
    if (!multi) {
      return (
        <ListRow
          testID={`pick-${info.id}`}
          title={info.name}
          subtitle={info.subtitle}
          accessibilityLabel={info.label}
          accessibilityHint={info.schedulable ? t('pick.plans') : t('pick.showsWhy')}
          onPress={() => chooseSingle(entry.aggregate, info)}
        />
      );
    }
    const index = selection.findIndex((s) => s.recipeId === info.id);
    const picked = index >= 0 ? selection[index] : undefined;
    return (
      <View>
        <ListRow
          testID={`pick-${info.id}`}
          variant="selectable"
          title={info.name}
          subtitle={info.subtitle}
          checked={!!picked}
          leading={picked ? <LetterBadge letter={letterFor(index)} index={index} /> : undefined}
          accessibilityLabel={
            picked
              ? `${info.label}, ${t('pick.recipeLetter', { letter: letterFor(index) })}`
              : info.label
          }
          accessibilityHint={info.schedulable ? undefined : t('pick.showsWhy')}
          onPress={() => toggle(entry.aggregate, info)}
        />
        {picked ? (
          <View style={{ paddingLeft: margin.left + space.xxl, paddingBottom: space.md }}>
            <Stepper
              testID={`pick-loaves-${info.id}`}
              label={t('pick.loavesFor', { recipe: info.name })}
              value={picked.loaves}
              min={1}
              max={50}
              onChange={(n) =>
                setSelection(
                  selection.map((s) => (s.recipeId === info.id ? { ...s, loaves: n } : s)),
                )
              }
              formatValue={(n) => loavesText(n)}
            />
          </View>
        ) : null}
      </View>
    );
  };

  let body;
  if (recipes.isPending) body = <Skeleton rows={6} />;
  else if (recipes.isError) {
    body = (
      <EmptyState
        variant="error"
        title={t('pick.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void recipes.refetch() }}
      />
    );
  } else if (infos.length === 0) {
    body = (
      <EmptyState
        title={t('pick.noRecipes.title')}
        body={t('pick.noRecipes.body')}
        action={{
          label: t('pick.newRecipe'),
          onPress: () => router.push(routes.recipeEditor('new')),
        }}
        secondaryAction={{
          label: t('pick.addStarters'),
          onPress: () => {
            addStarters().catch((error: unknown) => {
              logger.error('schedule.starters_failed', error);
              showSnackbar({ message: t('common.saveFailed') });
            });
          },
        }}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        variant="search"
        title={t('recipes.search.none', { query: search.query })}
        action={{ label: t('common.clearSearch'), onPress: () => search.setQuery('') }}
      />
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(i) => i.id}
        getItemType={(i) => i.type}
        extraData={`${multi}|${selection.map((s) => `${s.recipeId}${s.loaves}`).join()}`}
        contentContainerStyle={{ paddingBottom: space.xl }}
      />
    );
  }

  const ios = Platform.OS === 'ios';
  const selectButton = (
    <HeaderTextButton
      label={multi ? t('pick.done') : t('pick.select')}
      onPress={() => setMode(!multi)}
    />
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('pick.title'),
          headerLeft: () =>
            ios ? (
              <HeaderTextButton label={t('common.cancel')} onPress={closeModal} />
            ) : (
              <IconButton icon="close" accessibilityLabel={t('pick.close')} onPress={closeModal} />
            ),
          headerRight: () => selectButton,
          ...search.headerOptions,
        }}
      />
      {search.field}
      <View style={{ flex: 1 }}>{body}</View>
      {multi ? (
        <BottomActionBar
          footnote={t('pick.selectionSummary', {
            loaves: tp('pick.loaves', totalLoaves),
            recipes: tp('pick.recipes', selection.length),
          })}
        >
          <Button
            size="lg"
            fullWidth
            label={t('pick.continue')}
            onPress={continueWith}
            disabled={selection.length === 0}
            accessibilityHint={selection.length === 0 ? t('pick.selectFirst') : undefined}
            testID="pick-continue"
          />
        </BottomActionBar>
      ) : null}
    </View>
  );
}
