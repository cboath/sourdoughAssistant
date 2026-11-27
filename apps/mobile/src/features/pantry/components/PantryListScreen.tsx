import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import type { PantryCategory, PantryItem } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { routes } from '../../../lib/nav';
import { matchesQuery } from '../../../lib/text';
import {
  Chip,
  ContentColumn,
  EmptyState,
  Fab,
  FAB_CLEARANCE,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
  StatusTag,
} from '../../../ui/components';
import { useScreenSearch } from '../../../ui/useScreenSearch';
import { useTheme } from '../../../ui/theme';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { speakable } from '../../recipes/format';
import { categoryLabel, itemStatus, packageText, readableUnitCost } from '../format';
import { usePantryList } from '../hooks/usePantry';
import { PriceUpdateSheet } from './PriceUpdateSheet';

export const CATEGORY_ORDER: readonly PantryCategory[] = [
  'flour',
  'water',
  'salt',
  'starter',
  'yeast',
  'sweetener',
  'fat',
  'dairy',
  'inclusion',
  'other',
];

type Row =
  { type: 'header'; key: string; title: string } | { type: 'item'; key: string; item: PantryItem };

/** Sections follow category order, rows sort by name; empty sections are hidden. */
export function buildRows(items: readonly PantryItem[]): Row[] {
  const rows: Row[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCategory = items
      .filter((i) => i.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (inCategory.length === 0) continue;
    rows.push({ type: 'header', key: `h:${category}`, title: categoryLabel(category) });
    for (const item of inCategory) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

/** PANTRY-LIST (screens-recipes.md section 1). */
export function PantryListScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const display = useDisplayContext();
  const list = usePantryList();
  const search = useScreenSearch(t('pantry.search.placeholder'));
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [priceTarget, setPriceTarget] = useState<PantryItem | null>(null);

  const items = useMemo(() => list.data ?? [], [list.data]);
  const unpricedCount = useMemo(
    () => items.filter((i) => itemStatus(i) === 'unpriced').length,
    [items],
  );
  // When the last unpriced item gets a price the filter turns itself off.
  const filterActive = unpricedOnly && unpricedCount > 0;

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (!filterActive || itemStatus(i) === 'unpriced') && matchesQuery([i.name], search.query),
      ),
    [items, filterActive, search.query],
  );
  const rows = useMemo(() => buildRows(visible), [visible]);

  const addItem = useCallback(() => router.push(routes.pantryEditor('new')), [router]);
  const openItem = useCallback((id: string) => router.push(routes.pantryItem(id)), [router]);
  const menu = useCallback(
    (item: PantryItem) =>
      Alert.alert(item.name, undefined, [
        { text: t('pantry.menu.updatePrice'), onPress: () => setPriceTarget(item) },
        { text: t('pantry.menu.edit'), onPress: () => router.push(routes.pantryEditor(item.id)) },
        { text: t('common.cancel'), style: 'cancel' },
      ]),
    [router],
  );

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => {
      if (row.type === 'header') return <SectionHeader title={row.title} />;
      const item = row.item;
      const status = itemStatus(item);
      const pkg = packageText(item, display);
      const readable = readableUnitCost(item, display);
      let value: string | undefined;
      let trailing;
      if (status === 'priced' || status === 'free') value = readable ?? undefined;
      else if (status === 'needsDensity') {
        trailing = <StatusTag variant="unpriced" text={t('pantry.row.needsDensity')} />;
      } else if (status === 'needsEach') {
        trailing = <StatusTag variant="unpriced" text={t('pantry.row.needsEach')} />;
      } else trailing = <StatusTag variant="unpriced" />;
      const label =
        status === 'unpriced'
          ? `${item.name}, ${t('pantry.row.unpriced').toLowerCase()}`
          : [
              item.name,
              pkg,
              readable ?? t(`pantry.row.${status === 'needsEach' ? 'needsEach' : 'needsDensity'}`),
            ]
              .filter(Boolean)
              .join(', ');
      const spoken = speakable(label);
      return (
        <ListRow
          title={item.name}
          subtitle={pkg ?? undefined}
          value={value}
          trailing={trailing}
          accessibilityLabel={spoken}
          accessibilityHint={t('pantry.row.hint')}
          onPress={() => openItem(item.id)}
          onLongPress={() => menu(item)}
          accessibilityActions={[
            { name: 'updatePrice', label: t('pantry.menu.updatePrice') },
            { name: 'edit', label: t('pantry.menu.edit') },
          ]}
          onAccessibilityAction={(name) =>
            name === 'updatePrice'
              ? setPriceTarget(item)
              : router.push(routes.pantryEditor(item.id))
          }
          testID={`pantry-row-${item.id}`}
        />
      );
    },
    [display, menu, openItem, router],
  );

  let body;
  if (list.isPending) body = <Skeleton rows={6} />;
  else if (list.isError) {
    body = (
      <EmptyState
        variant="error"
        title={t('pantry.loadError')}
        action={{ label: t('common.tryAgain'), onPress: () => void list.refetch() }}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title={t('pantry.empty.title')}
        body={t('pantry.empty.body')}
        icon="pantry"
        action={{ label: t('pantry.add'), onPress: addItem }}
      />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        variant="search"
        title={t('pantry.search.none', { query: search.query })}
        action={{
          label: t('common.clearSearch'),
          onPress: () => {
            search.setQuery('');
            setUnpricedOnly(false);
          },
        }}
      />
    );
  } else {
    body = (
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
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
          title: t('pantry.title'),
          headerLargeTitle: Platform.OS === 'ios',
          headerRight: () =>
            Platform.OS === 'ios' ? (
              <IconButton icon="plus" accessibilityLabel={t('pantry.add')} onPress={addItem} />
            ) : null,
          ...search.headerOptions,
        }}
      />
      {search.field}
      {unpricedCount > 0 ? (
        <ContentColumn style={{ paddingTop: space.sm, paddingBottom: space.sm, width: '100%' }}>
          <View
            accessibilityRole="toolbar"
            accessibilityLabel={t('pantry.filters')}
            style={{ flexDirection: 'row' }}
          >
            <Chip
              label={t('pantry.filter.unpriced', { count: unpricedCount })}
              selected={filterActive}
              onPress={() => setUnpricedOnly((v) => !v)}
            />
          </View>
        </ContentColumn>
      ) : null}
      <View style={{ flex: 1 }}>{body}</View>
      <Fab label={t('pantry.add')} onPress={addItem} testID="pantry-fab" />
      <PriceUpdateSheet item={priceTarget} onClose={() => setPriceTarget(null)} />
    </View>
  );
}
