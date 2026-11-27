/** Row data shared by the recipe picker and the "Add recipe" sheet (screens-bake.md 2.1, 2.3). */
import { Alert } from 'react-native';
import { t } from '../../lib/i18n';
import type { RecipeAggregate } from '../../db/types';
import { loavesText, spokenDuration } from '../recipes/format';
import { spanMinutes } from '../recipes/metrics';
import { firstReason } from './reasons';
import { toStepTemplates } from './snapshot';
import { formatSpan } from './time';

export interface PickRowInfo {
  id: string;
  name: string;
  yieldLoaves: number;
  favorite: boolean;
  schedulable: boolean;
  reason: string | null;
  subtitle: string;
  label: string;
}

export function pickRowInfo(aggregate: RecipeAggregate, locale: string): PickRowInfo {
  const { recipe } = aggregate;
  const steps = toStepTemplates(aggregate);
  const reason = firstReason(steps);
  const span = reason ? null : spanMinutes(steps, 1);
  const loaves = loavesText(recipe.yieldLoaves);
  const subtitle =
    span === null
      ? t('pick.cantSchedule')
      : t('pick.row.summary', { span: formatSpan(span, locale), loaves });
  const spokenSpan = span === null ? null : spokenDuration(span, locale);
  return {
    id: recipe.id,
    name: recipe.name,
    yieldLoaves: recipe.yieldLoaves,
    favorite: recipe.favorite,
    schedulable: span !== null,
    reason,
    subtitle,
    label:
      span === null
        ? `${recipe.name}, ${t('pick.cantSchedule')}`
        : t('pick.row.label', { recipe: recipe.name, summary: `${spokenSpan}, ${loaves}` }),
  };
}

/** Native alert explaining why a recipe can't be scheduled, with a way to fix it. */
export function alertCantSchedule(info: PickRowInfo, onEdit: () => void): void {
  Alert.alert(t('pick.cant.title', { recipe: info.name }), info.reason ?? undefined, [
    { text: t('pick.edit'), onPress: onEdit },
    { text: t('common.ok'), style: 'cancel' },
  ]);
}
