import { useMemo, useState, type RefObject } from 'react';
import { View } from 'react-native';
import type { PantryCategory, PantryItem } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { matchesQuery } from '../../../lib/text';
import { cleanPrefill } from '../../../lib/route-params';
import {
  EmptyState,
  Icon,
  ListRow,
  SearchField,
  SectionHeader,
  Sheet,
} from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { CATEGORY_ORDER } from '../../pantry/components/PantryListScreen';
import { categoryLabel, itemStatus, readableUnitCost } from '../../pantry/format';
import { usePantryList } from '../../pantry/hooks/usePantry';
import { useRecipeAggregates } from '../hooks/useRecipeData';

export type PickerMode = 'add' | 'replace' | 'levainFlour';

export interface IngredientPickerProps {
  visible: boolean;
  mode: PickerMode;
  /** The control that opened the sheet; focus returns to it on close. */
  openerRef?: RefObject<unknown>;
  /** Pantry items already used in the recipe being edited ("In this recipe"). */
  usedItemIds: ReadonlySet<string>;
  onClose: () => void;
  onSelectItem: (item: PantryItem) => void;
  /** `add` mode: the pinned "Levain (starter)" row. */
  onSelectLevain?: () => void;
  /** "Add "{query}" to pantry" (or the empty state button, with an empty query). */
  onAddToPantry: (query: string) => void;
}

const TITLES = {
  add: 'pick.titleAdd',
  replace: 'pick.titleReplace',
  levainFlour: 'pick.titleLevain',
} as const;

/** INGR-PICK (screens-recipes.md section 7): a sheet, not a route. */
export function IngredientPickerSheet(props: IngredientPickerProps) {
  const {
    visible,
    mode,
    openerRef,
    usedItemIds,
    onClose,
    onSelectItem,
    onSelectLevain,
    onAddToPantry,
  } = props;
  const display = useDisplayContext();
  const { space } = useTheme();
  const pantry = usePantryList();
  const recipes = useRecipeAggregates();
  const [query, setQuery] = useState('');
  const items = useMemo(() => pantry.data ?? [], [pantry.data]);

  const recent = useMemo(() => {
    const lines = (recipes.data ?? [])
      .flatMap((r) => r.ingredients)
      .filter((l) => l.pantryItemId !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const seen = new Set<string>();
    const out: PantryItem[] = [];
    for (const line of lines) {
      const id = line.pantryItemId as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const item = items.find((i) => i.id === id);
      if (item) out.push(item);
      if (out.length === 5) break;
    }
    return out;
  }, [recipes.data, items]);

  const filtered = useMemo(
    () => items.filter((i) => matchesQuery([i.name], query)),
    [items, query],
  );
  const searching = query.trim() !== '';
  const exact = items.some(
    (i) => i.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
  );

  const close = () => {
    setQuery('');
    onClose();
  };
  const select = (item: PantryItem) => {
    setQuery('');
    onSelectItem(item);
  };

  const row = (item: PantryItem) => {
    const cost =
      itemStatus(item) === 'unpriced'
        ? t('pantry.row.unpriced')
        : (readableUnitCost(item, display) ?? t('pantry.row.unpriced'));
    const inRecipe = usedItemIds.has(item.id);
    return (
      <ListRow
        key={item.id}
        title={item.name}
        subtitle={cost}
        value={inRecipe ? t('pick.inRecipe') : undefined}
        variant="navigation"
        accessibilityLabel={`${item.name}, ${cost}${inRecipe ? `, ${t('pick.inRecipe').toLowerCase()}` : ''}`}
        onPress={() => select(item)}
        testID={`pick-${item.id}`}
      />
    );
  };

  // `levainFlour` lists flour first, then everything else under "Other items".
  const sections: Array<{ key: string; title: string; items: PantryItem[] }> = [];
  if (mode === 'levainFlour') {
    const flours = filtered.filter((i) => i.category === 'flour');
    const rest = filtered.filter((i) => i.category !== 'flour');
    if (flours.length)
      sections.push({ key: 'flour', title: categoryLabel('flour'), items: flours });
    if (rest.length) sections.push({ key: 'other', title: t('pick.otherItems'), items: rest });
  } else {
    for (const category of CATEGORY_ORDER as readonly PantryCategory[]) {
      const inCat = filtered.filter((i) => i.category === category);
      if (inCat.length)
        sections.push({ key: category, title: categoryLabel(category), items: inCat });
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={t(TITLES[mode])} openerRef={openerRef}>
      {items.length === 0 && !pantry.isPending ? (
        <EmptyState
          title={t('pick.empty.title')}
          body={t('pick.empty.body')}
          icon="pantry"
          action={{ label: t('pantry.add'), onPress: () => onAddToPantry('') }}
        />
      ) : (
        <View>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              accessibilityLabel={t('pantry.search.placeholder')}
              placeholder={t('pantry.search.placeholder')}
            />
          </View>
          {mode === 'add' && onSelectLevain && !searching ? (
            <ListRow
              title={t('pick.levain')}
              subtitle={t('pick.levainSub')}
              leading={<Icon name="levain" />}
              onPress={() => {
                setQuery('');
                onSelectLevain();
              }}
              testID="pick-levain"
            />
          ) : null}
          {!searching && recent.length > 0 ? (
            <>
              <SectionHeader title={t('pick.recent')} />
              {recent.map(row)}
            </>
          ) : null}
          {sections.map((section) => (
            <View key={section.key}>
              <SectionHeader title={section.title} />
              {section.items.map(row)}
            </View>
          ))}
          {searching && filtered.length === 0 ? (
            <EmptyState variant="search" title={t('pantry.search.none', { query })} />
          ) : null}
          {searching && !exact ? (
            <ListRow
              title={t('pick.addToPantry', { query: cleanPrefill(query) })}
              leading={<Icon name="plus" />}
              onPress={() => {
                const q = cleanPrefill(query);
                setQuery('');
                onAddToPantry(q);
              }}
              testID="pick-add-to-pantry"
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
