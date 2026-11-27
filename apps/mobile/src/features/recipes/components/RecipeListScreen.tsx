import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { formatMoney } from '@sourdough/core';
import { t, tp } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { flags } from '../../../lib/flags';
import { href, routes } from '../../../lib/nav';
import { matchesQuery } from '../../../lib/text';
import { showSnackbar } from '../../../state/snackbar';
import {
  ActionSheet,
  Chip,
  ContentColumn,
  EmptyState,
  Fab,
  FAB_CLEARANCE,
  IconButton,
  ListRow,
  SearchField,
  Sheet,
  Skeleton,
  StatusTag,
} from '../../../ui/components';
import { confirm } from '../../../ui/confirm';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { useScreenSearch } from '../../../ui/useScreenSearch';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { formatRatioPercent, speakable } from '../format';
import {
  useAddStarterRecipes,
  useRecipeService,
  useRecipeSummaries,
  type RecipeSummary,
} from '../hooks/useRecipeData';

const scheduleHref = (id: string) => href(`/bake/schedule/plan?recipeId=${id}`);

/** Distinct tags, most used first, then A to Z. */
export function tagUniverse(recipes: readonly Pick<RecipeSummary, 'tags'>[]): string[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes)
    for (const tag of recipe.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
    .map(([tag]) => tag);
}

export function filterSummaries(
  recipes: readonly RecipeSummary[],
  filter: { query: string; tags: readonly string[]; favoritesOnly: boolean },
): RecipeSummary[] {
  return recipes.filter(
    (r) =>
      (!filter.favoritesOnly || r.favorite) &&
      filter.tags.every((tag) => r.tags.includes(tag)) &&
      matchesQuery([r.name, ...r.tags], filter.query),
  );
}

/** RECIPE-LIST (screens-recipes.md section 5). */
export function RecipeListScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const display = useDisplayContext();
  const list = useRecipeSummaries();
  const service = useRecipeService();
  const addStarters = useAddStarterRecipes();
  const search = useScreenSearch(t('recipes.search.placeholder'));
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const universe = useMemo(() => tagUniverse(all), [all]);
  const hasFavorites = all.some((r) => r.favorite);
  const filtersActive = favoritesOnly || tags.length > 0;
  const visible = useMemo(
    () => filterSummaries(all, { query: search.query, tags, favoritesOnly }),
    [all, search.query, tags, favoritesOnly],
  );

  const newRecipe = useCallback(() => {
    if (all.length === 0) router.push(routes.recipeEditor('new'));
    else setChooserOpen(true);
  }, [all.length, router]);

  const remove = useCallback(
    async (recipe: Pick<RecipeSummary, 'id' | 'name'>) => {
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
          onAction: () => void remove(recipe),
        });
      }
    },
    [service],
  );

  const toggleFavorite = useCallback(
    (recipe: RecipeSummary) => {
      haptic('selection');
      service.setFavorite(recipe.id, !recipe.favorite).catch((error: unknown) => {
        logger.error('recipes.favorite_failed', error);
        showSnackbar({
          message: t('common.saveFailed'),
          actionLabel: t('common.retry'),
          onAction: () => toggleFavorite(recipe),
        });
      });
    },
    [service],
  );

  const [menuFor, setMenuFor] = useState<RecipeSummary | null>(null);
  const menu = setMenuFor;

  const renderItem = useCallback(
    ({ item: recipe }: { item: RecipeSummary }) => {
      const loavesPart =
        recipe.stepCount === 0
          ? t('recipes.row.noSteps')
          : tp('recipes.row.loaves', recipe.yieldLoaves);
      const hydrationPart =
        recipe.totalFlourG > 0
          ? t('recipes.row.hydration', {
              pct: formatRatioPercent(recipe.totalWaterG, recipe.totalFlourG, display.locale),
            })
          : t('recipes.row.noFlour');
      const costPart = recipe.costComplete
        ? t('detail.cost.perLoaf', {
            money: formatMoney(recipe.perLoafCents, display.currency, display.locale),
          })
        : null;
      const subtitle = [hydrationPart, loavesPart, costPart].filter(Boolean).join(' · ');
      const label = `${recipe.name}. ${speakable(subtitle)}${recipe.costComplete ? '' : `. ${t('recipes.row.costIncomplete')}`}${recipe.favorite ? `. ${t('recipes.fav.rowSuffix')}` : ''}`;
      return (
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'transparent' }}
        >
          <View style={{ flex: 1 }}>
            <ListRow
              title={recipe.name}
              subtitle={subtitle}
              trailing={
                recipe.costComplete ? undefined : (
                  <StatusTag variant="unpriced" text={t('recipes.row.costIncomplete')} />
                )
              }
              accessibilityLabel={label}
              accessibilityHint={t('recipes.row.hint')}
              onPress={() => router.push(routes.recipe(recipe.id))}
              onLongPress={() => menu(recipe)}
              accessibilityActions={[
                ...(flags.scheduling
                  ? [{ name: 'schedule', label: t('recipes.menu.schedule') }]
                  : []),
                { name: 'duplicate', label: t('recipes.menu.duplicate') },
                {
                  name: 'favorite',
                  label: t(recipe.favorite ? 'recipes.fav.remove' : 'recipes.fav.add'),
                },
                { name: 'delete', label: t('recipes.menu.delete') },
              ]}
              onAccessibilityAction={(name) => {
                if (name === 'schedule') router.push(scheduleHref(recipe.id));
                else if (name === 'duplicate')
                  router.push(routes.recipeEditor('new', `?duplicateOf=${recipe.id}`));
                else if (name === 'favorite') toggleFavorite(recipe);
                else void remove(recipe);
              }}
              testID={`recipe-row-${recipe.id}`}
            />
          </View>
          <IconButton
            variant="toggle"
            icon={recipe.favorite ? 'star' : 'starOutline'}
            selected={recipe.favorite}
            accessibilityLabel={t('recipes.fav.label', { name: recipe.name })}
            onPress={() => toggleFavorite(recipe)}
            testID={`favorite-${recipe.id}`}
          />
        </View>
      );
    },
    [display, menu, remove, router, toggleFavorite],
  );

  const clearFilters = () => {
    setFavoritesOnly(false);
    setTags([]);
    search.setQuery('');
  };

  let body;
  if (list.isPending) body = <Skeleton rows={6} />;
  else if (list.isError) {
    body = (
      <EmptyState
        variant="error"
        title={t('recipes.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void list.refetch() }}
      />
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState
        title={t('recipes.empty.title')}
        body={t('recipes.empty.body')}
        action={{ label: t('recipes.new'), onPress: newRecipe }}
        secondaryAction={{
          label: t('recipes.empty.seed'),
          onPress: () => {
            addStarters()
              .then(() => showSnackbar({ message: t('recipes.seeded') }))
              .catch((error: unknown) => {
                logger.error('recipes.seed_failed', error);
                showSnackbar({ message: t('common.saveFailed') });
              });
          },
        }}
      />
    );
  } else if (visible.length === 0) {
    const onlyFavorites =
      favoritesOnly && tags.length === 0 && search.query === '' && !hasFavorites;
    body = (
      <EmptyState
        variant="search"
        icon={onlyFavorites ? 'star' : undefined}
        title={
          onlyFavorites
            ? t('recipes.fav.none')
            : search.query
              ? t('recipes.search.none', { query: search.query })
              : t('recipes.filter.none')
        }
        action={
          onlyFavorites
            ? undefined
            : {
                label: search.query ? t('common.clearSearch') : t('recipes.filter.clearAll'),
                onPress: clearFilters,
              }
        }
      />
    );
  } else {
    body = (
      <FlashList
        data={visible}
        renderItem={renderItem}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'android' ? FAB_CLEARANCE + space.lg : space.lg,
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t('recipes.title'),
          headerLargeTitle: Platform.OS === 'ios',
          headerRight: () =>
            Platform.OS === 'ios' ? (
              <IconButton icon="plus" accessibilityLabel={t('recipes.new')} onPress={newRecipe} />
            ) : null,
          ...search.headerOptions,
        }}
      />
      {search.field}
      {universe.length > 0 || hasFavorites ? (
        <ContentColumn style={{ paddingVertical: space.sm }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={t('recipes.filter.group')}
            contentContainerStyle={{ gap: space.sm, alignItems: 'center' }}
          >
            <Chip
              label={t('recipes.filter.favorites')}
              accessibilityLabel={t('recipes.filter.favoritesOnly')}
              selected={favoritesOnly}
              onPress={() => setFavoritesOnly((v) => !v)}
              testID="chip-favorites"
            />
            {universe.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                accessibilityLabel={t('recipes.filter.tag', { tag })}
                selected={tags.includes(tag)}
                onPress={() =>
                  setTags((current) =>
                    current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
                  )
                }
                testID={`chip-tag-${tag}`}
              />
            ))}
            {filtersActive ? (
              <Chip
                variant="assist"
                label={t('recipes.filter.clear')}
                onPress={() => {
                  setFavoritesOnly(false);
                  setTags([]);
                }}
              />
            ) : null}
          </ScrollView>
        </ContentColumn>
      ) : null}
      <View style={{ flex: 1 }}>{body}</View>
      <Fab label={t('recipes.new')} onPress={newRecipe} testID="recipes-fab" />
      <ActionSheet
        title={menuFor?.name ?? null}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                ...(flags.scheduling
                  ? [
                      {
                        label: t('recipes.menu.schedule'),
                        onPress: () => router.push(scheduleHref(menuFor.id)),
                      },
                    ]
                  : []),
                {
                  label: t('recipes.menu.duplicate'),
                  onPress: () =>
                    router.push(routes.recipeEditor('new', `?duplicateOf=${menuFor.id}`)),
                },
                {
                  label: t(menuFor.favorite ? 'recipes.fav.remove' : 'recipes.fav.add'),
                  onPress: () => toggleFavorite(menuFor),
                },
                {
                  label: t('recipes.menu.delete'),
                  destructive: true,
                  onPress: () => void remove(menuFor),
                },
              ]
            : []
        }
      />
      <NewRecipeSheet
        visible={chooserOpen}
        recipes={all}
        onClose={() => setChooserOpen(false)}
        onBlank={() => {
          setChooserOpen(false);
          router.push(routes.recipeEditor('new'));
        }}
        onCopy={(id) => {
          setChooserOpen(false);
          router.push(routes.recipeEditor('new', `?duplicateOf=${id}`));
        }}
      />
    </View>
  );
}

function NewRecipeSheet({
  visible,
  recipes,
  onClose,
  onBlank,
  onCopy,
}: {
  visible: boolean;
  recipes: readonly RecipeSummary[];
  onClose: () => void;
  onBlank: () => void;
  onCopy: (id: string) => void;
}) {
  const { space } = useTheme();
  const [copying, setCopying] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => {
    setCopying(false);
    setQuery('');
    onClose();
  };
  const matches = recipes.filter((r) => matchesQuery([r.name], query));
  return (
    <Sheet visible={visible} onClose={close} title={t('recipes.new.title')}>
      {copying ? (
        <View>
          <ContentColumn style={{ paddingBottom: space.sm }}>
            <SearchPill value={query} onChangeText={setQuery} />
          </ContentColumn>
          {matches.map((r) => (
            <ListRow
              key={r.id}
              title={r.name}
              onPress={() => onCopy(r.id)}
              testID={`copy-${r.id}`}
            />
          ))}
        </View>
      ) : (
        <View>
          <ListRow
            title={t('recipes.new.blank')}
            subtitle={t('recipes.new.blankSub')}
            onPress={onBlank}
            testID="new-blank"
          />
          <ListRow
            title={t('recipes.new.copy')}
            subtitle={t('recipes.new.copySub')}
            onPress={() => setCopying(true)}
            testID="new-copy"
          />
        </View>
      )}
    </Sheet>
  );
}

function SearchPill({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <SearchField
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={t('recipes.search.placeholder')}
      placeholder={t('recipes.search.placeholder')}
    />
  );
}
