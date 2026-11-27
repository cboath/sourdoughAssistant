import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import type { RecipeAggregate } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { routes } from '../../../lib/nav';
import { ListRow, Sheet, Text } from '../../../ui/components';
import { useLocale } from '../../../ui/hooks/useLocale';
import { useTheme } from '../../../ui/theme';
import { alertCantSchedule, pickRowInfo } from '../pickRows';

/** RECIPE-ADD-SHEET (screens-bake.md 3.4): recipes not yet in the bake, one tap to append. */
export function RecipeAddSheet({
  visible,
  recipes,
  taken,
  onClose,
  onPick,
}: {
  visible: boolean;
  recipes: readonly RecipeAggregate[];
  taken: readonly string[];
  onClose: () => void;
  onPick: (recipe: RecipeAggregate) => void;
}) {
  const router = useRouter();
  const { space } = useTheme();
  const { locale } = useLocale();
  const rows = useMemo(
    () =>
      recipes
        .filter((r) => !taken.includes(r.recipe.id))
        .map((r) => ({ aggregate: r, info: pickRowInfo(r, locale) }))
        .sort((a, b) => a.info.name.localeCompare(b.info.name, locale)),
    [recipes, taken, locale],
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={t('plan.multi.addTitle')} testID="add-sheet">
      {rows.length === 0 ? (
        <View style={{ padding: space.lg }}>
          <Text color="textSecondary">{t('plan.multi.none')}</Text>
        </View>
      ) : (
        rows.map(({ aggregate, info }) => (
          <ListRow
            key={info.id}
            testID={`add-${info.id}`}
            title={info.name}
            subtitle={info.subtitle}
            accessibilityLabel={info.label}
            accessibilityHint={info.schedulable ? t('pick.plans') : t('pick.showsWhy')}
            onPress={() => {
              if (info.schedulable) onPick(aggregate);
              else {
                onClose();
                alertCantSchedule(info, () => router.push(routes.recipeEditor(info.id)));
              }
            }}
          />
        ))
      )}
    </Sheet>
  );
}
