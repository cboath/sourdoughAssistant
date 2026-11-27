import { useState } from 'react';
import { View } from 'react-native';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import type { BakeAggregate } from '../../../db/types';
import { t, tp } from '../../../lib/i18n';
import { splitLevain } from '@sourdough/core';
import { Divider, ListRow, SegmentedControl, Sheet, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { formatGrams, speakable } from '../../recipes/format';
import { letterFor } from '../../schedule/labels';

export interface IngredientsSheetProps {
  visible: boolean;
  onClose: () => void;
  aggregate: BakeAggregate;
  locale: string;
  /** The recipe to show first (the panel whose button was tapped). */
  initialItemId?: string;
}

/** What to weigh, from the bake's own snapshot (ADR 0014): it does not change if the recipe does. */
export function IngredientsSheet({
  visible,
  onClose,
  aggregate,
  locale,
  initialItemId,
}: IngredientsSheetProps) {
  const { space, layout } = useTheme();
  const { fontScale } = useFontScale();
  const items = [...aggregate.items].sort((a, b) => a.position - b.position);
  // Four narrow segments truncate: from three recipes, or at large text, use a list (DR2-24).
  const asList = items.length > 2 || fontScale >= layout.timelineStackFontScale;
  const [selected, setSelected] = useState(initialItemId ?? items[0]?.id ?? '');
  const item = items.find((i) => i.id === selected) ?? items[0];
  const ingredients = item?.recipeSnapshot.ingredients ?? [];
  const total = ingredients.reduce((sum, line) => sum + line.amountG, 0);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('ingredients.title')}
      testID="ingredients-sheet"
    >
      <View style={{ paddingBottom: space.lg }}>
        {items.length > 1 && asList
          ? items.map((i, index) => (
              <ListRow
                key={i.id}
                variant="selectable"
                selectionMode="single"
                checked={i.id === item?.id}
                title={`${letterFor(index)} ${i.recipeSnapshot.recipe.name}`}
                onPress={() => setSelected(i.id)}
              />
            ))
          : null}
        {items.length > 1 && !asList ? (
          <View style={{ padding: space.lg }}>
            <SegmentedControl
              label={t('ingredients.title')}
              segments={items.map((i, index) => ({
                value: i.id,
                label: `${letterFor(index)} ${i.recipeSnapshot.recipe.name}`,
              }))}
              value={item?.id ?? ''}
              onChange={setSelected}
            />
          </View>
        ) : null}
        {item ? (
          <Text
            variant="footnote"
            color="textSecondary"
            style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}
          >
            {tp('ingredients.scaled', item.loaves)}
          </Text>
        ) : null}
        {ingredients.length === 0 ? (
          <Text color="textSecondary" style={{ padding: space.lg }}>
            {t('ingredients.empty')}
          </Text>
        ) : (
          ingredients.map((line) => {
            const amount = formatGrams(line.amountG, locale);
            const sub =
              line.role === 'levain' && line.levainHydrationPct !== null
                ? (() => {
                    const split = splitLevain(line.amountG, line.levainHydrationPct);
                    return t('ingredients.levain', {
                      hydration: line.levainHydrationPct,
                      flour: formatGrams(split.flourG, locale),
                      water: formatGrams(split.waterG, locale),
                    });
                  })()
                : null;
            return (
              <View key={line.id}>
                <View
                  accessible
                  accessibilityLabel={`${line.name}, ${speakable(amount)}${sub ? `, ${sub}` : ''}`}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.md,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{line.name}</Text>
                    {sub ? (
                      <Text variant="footnote" color="textSecondary">
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="headline" numeric>
                    {amount}
                  </Text>
                </View>
                <Divider />
              </View>
            );
          })
        )}
        {ingredients.length > 0 ? (
          <Text variant="headline" style={{ padding: space.lg }} numeric>
            {t('ingredients.total', { total: formatGrams(total, locale) })}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
