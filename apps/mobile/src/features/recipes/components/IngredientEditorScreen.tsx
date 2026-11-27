import { randomUUID } from 'expo-crypto';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useForm } from 'react-hook-form';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import {
  formatMoney,
  lineCostCents,
  splitLevain,
  toGrams,
  unitCostCentsPerGram,
} from '@sourdough/core';
import type { IngredientRole, PantryItem, Unit } from '../../../db/types';
import { t, tp, type MessageKey } from '../../../lib/i18n';
import { makeResolver } from '../../../lib/form';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { formatNumberInput } from '../../../lib/number';
import { LIMITS } from '../../../lib/sanitize';
import { showSnackbar } from '../../../state/snackbar';
import {
  Banner,
  Button,
  Chip,
  ContentColumn,
  EditorGone,
  Skeleton,
  FormAmountField,
  FormSubmittedContext,
  FormTextField,
  ListRow,
  StatusTag,
  Text,
} from '../../../ui/components';
import { editorHeaderOptions } from '../../../ui/editorHeader';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useDiscardGuard } from '../../../ui/useDiscardGuard';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { pricedPackage, readableUnitCost } from '../../pantry/format';
import { usePantryList, usePantryService } from '../../pantry/hooks/usePantry';
import { PriceUpdateSheet } from '../../pantry/components/PriceUpdateSheet';
import { usePickedItem } from '../../pantry/pickedItem';
import { amountDisplay, formatGrams } from '../format';
import {
  LINE_UNITS,
  ROLES,
  defaultRole,
  lineFactors,
  validateIngredient,
  type IngredientFields,
} from '../ingredientForm';
import type { DraftIngredient } from '../draft';
import { useRecipeDraft } from '../store';
import { IngredientPickerSheet, type PickerMode } from './IngredientPickerSheet';

export interface IngredientEditorProps {
  lineId?: string;
  pantryItemId?: string;
  role?: 'levain';
}

/** INGR-EDIT (screens-recipes.md section 8). Done writes into the draft, never to the database. */
export function IngredientEditorScreen(props: IngredientEditorProps) {
  const draft = useRecipeDraft((s) => s.draft);
  const pantry = usePantryList({ includeArchived: true });
  const gone = (
    <EditorGone
      pushed
      title={t('ingr.gone')}
      headerTitle={t('ingr.titleEdit')}
      actionLabel={t('ingr.backToRecipe')}
    />
  );
  if (!draft) return gone;
  const line = props.lineId ? draft.ingredients.find((i) => i.id === props.lineId) : undefined;
  if (props.lineId && !line) return gone;
  if (pantry.isPending) {
    return (
      <ContentColumn>
        <Skeleton rows={4} />
      </ContentColumn>
    );
  }
  return <IngredientForm {...props} line={line} items={pantry.data ?? []} />;
}

const FIELD_ORDER: Array<keyof IngredientFields> = [
  'name',
  'amount',
  'gramsPerCup',
  'gramsPerEach',
  'levainHydration',
];

function IngredientForm({
  line,
  pantryItemId: paramItemId,
  role: paramRole,
  items,
}: IngredientEditorProps & {
  line: DraftIngredient | undefined;
  items: PantryItem[];
}) {
  const router = useRouter();
  const { space } = useTheme();
  const display = useDisplayContext();
  const service = usePantryService();
  const store = useRecipeDraft.getState;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const editing = line !== undefined;

  const [itemId, setItemId] = useState<string | null>(
    line ? line.pantryItemId : (paramItemId ?? null),
  );
  const item = itemId ? (byId.get(itemId) ?? null) : null;
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [itemError, setItemError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const nameTouched = useRef(editing);
  const itemRowRef = useRef<ComponentRef<typeof View>>(null);

  const initial = useMemo<IngredientFields>(() => {
    if (line) {
      const factors = lineFactors(
        line.pantryItemId ? (byId.get(line.pantryItemId) ?? null) : null,
        line.role,
        null,
        null,
      );
      const entry =
        line.entryAmount !== null && line.entryUnit !== null
          ? toGrams(line.entryAmount, line.entryUnit, factors)
          : null;
      const useEntry = entry?.ok === true && Math.round(entry.value) === Math.round(line.amountG);
      return {
        name: line.name,
        amount: useEntry
          ? formatNumberInput(line.entryAmount as number, display.locale)
          : formatNumberInput(line.amountG, display.locale, 1),
        unit: useEntry ? (line.entryUnit as Unit) : 'g',
        role: line.role,
        levainHydration: line.levainHydrationPct !== null ? String(line.levainHydrationPct) : '100',
        gramsPerCup: '',
        gramsPerEach: '',
      };
    }
    const found = paramItemId ? byId.get(paramItemId) : undefined;
    const role: IngredientRole =
      paramRole === 'levain' ? 'levain' : found ? defaultRole(found.category) : 'other';
    return {
      name:
        role === 'levain' && paramRole === 'levain' ? t('ingr.levainName') : (found?.name ?? ''),
      amount: '',
      unit: 'g',
      role,
      levainHydration: '100',
      gramsPerCup: '',
      gramsPerEach: '',
    };
    // Only the first render decides the starting values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rulesRef = useRef({ locale: display.locale, item });
  rulesRef.current = { locale: display.locale, item };
  const form = useForm<IngredientFields>({
    mode: 'onTouched',
    defaultValues: initial,
    resolver: makeResolver((v) => validateIngredient(v, rulesRef.current).errors),
  });
  const { control, handleSubmit, watch, setValue, setFocus, formState } = form;
  const values = watch();
  // A first Save attempt makes every field show its error (screens-recipes.md 0.3).
  const [attempted, setAttempted] = useState(false);

  const dirty = formState.isDirty || itemId !== (line ? line.pantryItemId : (paramItemId ?? null));
  const guard = useDiscardGuard(dirty, {
    title: t('ingr.discard.title'),
    confirmLabel: t('common.discard.confirm'),
    cancelLabel: t('common.discard.keep'),
    destructive: true,
  });

  // The picker opens right away for a new levain line (the flour is required).
  useEffect(() => {
    if (!editing && paramRole === 'levain' && !paramItemId) setPickerMode('levainFlour');
  }, [editing, paramRole, paramItemId]);

  // A pantry item created from the picker comes back through the hand-off store.
  const pickedFromPantry = usePickedItem((s) =>
    s.request === 'replace' || s.request === 'levainFlour' ? s.itemId : null,
  );
  useEffect(() => {
    if (!pickedFromPantry) return;
    const request = usePickedItem.getState().request as PickerMode;
    const id = usePickedItem.getState().consume(request);
    if (id) chooseItem(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedFromPantry]);

  const chooseItem = (id: string) => {
    const chosen = byId.get(id);
    setItemId(id);
    setItemError(undefined);
    if (chosen && !nameTouched.current && values.role !== 'levain') {
      setValue('name', chosen.name, { shouldDirty: true });
    }
    setPickerMode(null);
  };

  const setRole = (role: IngredientRole) => {
    setValue('role', role, { shouldDirty: true });
    if (role === 'levain') setValue('levainHydration', '100', { shouldDirty: true });
    if (role !== 'levain') setValue('levainHydration', '', { shouldDirty: true });
    if (role === 'levain' && !nameTouched.current && values.name === (item?.name ?? '')) {
      setValue('name', t('ingr.levainName'), { shouldDirty: true });
    }
  };

  const validation = validateIngredient(values, { locale: display.locale, item });
  const parsed = validation.parsed;
  const unit = values.unit;
  const unitDim =
    unit === 'each' ? 'count' : ['ml', 'cup', 'tbsp', 'tsp'].includes(unit) ? 'volume' : 'mass';
  const showDensity =
    unitDim === 'volume' && item !== null && item.gramsPerCup === null && values.role !== 'water';
  const showEach = unit === 'each' && item !== null && item.gramsPerEach === null;

  // Secondary line under the amount: "= 450 g · about 3¾ cups".
  const secondary = useMemo(() => {
    if (!parsed) return undefined;
    const factors = lineFactors(item, values.role, parsed.gramsPerCup, parsed.gramsPerEach);
    const a = amountDisplay(parsed.amountG, display, factors);
    if (unit === 'g') return a.secondary ?? undefined;
    return t('ingr.amount.equals', {
      grams: a.primary,
      secondary: a.secondary ?? '',
    }).replace(/ · $/, '');
  }, [parsed, item, values.role, display, unit]);

  const split =
    values.role === 'levain' && parsed
      ? splitLevain(parsed.amountG, parsed.levainHydrationPct ?? 100)
      : null;

  const splitText =
    split && parsed
      ? t('ingr.levainSplit', {
          amount: formatGrams(parsed.amountG, display.locale),
          flour: formatGrams(split.flourG, display.locale),
          water: formatGrams(split.waterG, display.locale),
        })
      : null;
  useAnnounce(splitText, 1000);

  const costText = useMemo(() => {
    if (!parsed || !item) return null;
    const pkg = pricedPackage({
      packagePriceCents: item.packagePriceCents,
      packageSize: item.packageSize,
      packageUnit: item.packageUnit,
      gramsPerCup: item.gramsPerCup ?? parsed.gramsPerCup,
      gramsPerEach: item.gramsPerEach ?? parsed.gramsPerEach,
    });
    if (!pkg) return { kind: 'unpriced' as const };
    const billed = split ? split.flourG : parsed.amountG;
    const cents = lineCostCents(billed, pkg);
    if (!cents.ok) return null;
    const per = unitCostCentsPerGram(pkg);
    const exactlyFree = pkg.priceCents === 0;
    if (exactlyFree) return { kind: 'text' as const, text: t('ingr.costFree') };
    if (cents.value === 0 && per.ok && per.value * billed > 0) {
      return {
        kind: 'text' as const,
        text: t('ingr.costBelow', { money: formatMoney(1, display.currency, display.locale) }),
      };
    }
    const money = formatMoney(cents.value, display.currency, display.locale);
    return {
      kind: 'text' as const,
      text: split
        ? t('ingr.costLevain', { flour: formatGrams(split.flourG, display.locale), money })
        : t('ingr.cost', { money }),
    };
  }, [parsed, item, split, display]);

  const doneForm = handleSubmit(
    async () => {
      const result = validateIngredient(form.getValues(), { locale: display.locale, item });
      let missingItem = false;
      if (form.getValues('role') === 'levain' && !itemId) {
        setItemError(t('val.levain.flour'));
        missingItem = true;
      }
      if (!result.parsed || missingItem) {
        haptic('warning');
        return;
      }
      const p = result.parsed;
      try {
        if (item && (p.gramsPerCup !== null || p.gramsPerEach !== null)) {
          await service.updateItem(item.id, {
            ...(item.gramsPerCup === null && p.gramsPerCup !== null
              ? { gramsPerCup: p.gramsPerCup }
              : {}),
            ...(item.gramsPerEach === null && p.gramsPerEach !== null
              ? { gramsPerEach: p.gramsPerEach }
              : {}),
          });
        }
        store().upsertIngredient({
          id: line?.id ?? randomUUID(),
          pantryItemId: itemId,
          name: p.name,
          role: p.role,
          amountG: p.amountG,
          entryAmount: p.entryAmount,
          entryUnit: p.entryUnit,
          levainHydrationPct: p.role === 'levain' ? p.levainHydrationPct : null,
        });
        guard.allowLeave();
        router.back();
      } catch (error) {
        logger.error('ingredient.save_failed', error);
        showSnackbar({
          message: t('common.saveFailed'),
          actionLabel: t('common.retry'),
          onAction: () => void done(),
        });
      }
    },
    (errors) => {
      setFailed(true);
      haptic('warning');
      const count = Object.keys(errors).length;
      AccessibilityInfo.announceForAccessibility(tp('val.announce', count));
      const first = FIELD_ORDER.find((key) => errors[key]);
      if (first) setFocus(first);
      if (form.getValues('role') === 'levain' && !itemId) setItemError(t('val.levain.flour'));
    },
  );

  const done = () => {
    setAttempted(true);
    return doneForm();
  };

  const remove = () => {
    if (!line) return;
    const removed = store().removeIngredient(line.id);
    guard.allowLeave();
    router.back();
    if (!removed) return;
    showSnackbar({
      message: t('edit.lineDeleted', { name: line.name }),
      actionLabel: t('common.undo'),
      onAction: () => {
        haptic('impactLight');
        store().insertIngredient(removed.item, removed.index);
      },
    });
  };

  const levain = values.role === 'levain';
  const itemSub = item ? (readableUnitCost(item, display) ?? t('pantry.row.unpriced')) : undefined;

  return (
    <FormSubmittedContext.Provider value={attempted}>
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={editorHeaderOptions({
            title: t(editing ? 'ingr.titleEdit' : 'ingr.titleNew'),
            onClose: () => router.back(),
            onSave: () => void done(),
            saveLabel: t('common.done'),
            pushed: true,
          })}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <ContentColumn padded={false}>
            <View style={{ paddingTop: space.lg }}>
              <ListRow
                title={
                  item
                    ? `${item.name}${item.deletedAt ? ` ${t('edit.archivedSuffix')}` : ''}`
                    : t(levain ? 'ingr.pickFlour' : 'ingr.linkToPantry')
                }
                subtitle={itemSub}
                value={undefined}
                accessibilityLabel={`${t(levain ? 'ingr.itemLevain' : 'ingr.item')}, ${item?.name ?? t(levain ? 'ingr.pickFlour' : 'ingr.linkToPantry')}`}
                trailing={!item ? <StatusTag variant="unpriced" /> : undefined}
                onPress={() => setPickerMode(levain ? 'levainFlour' : 'replace')}
                ref={itemRowRef}
                testID="ingredient-item"
              />
              {itemError ? (
                <Text variant="footnote" color="danger" style={{ paddingHorizontal: space.lg }}>
                  {itemError}
                </Text>
              ) : null}
            </View>
            <View style={{ padding: space.lg, gap: space.lg }}>
              {failed && Object.keys(formState.errors).length > 0 ? (
                <Banner
                  variant="danger"
                  message={tp('val.summary', Object.keys(formState.errors).length)}
                />
              ) : null}
              <FormTextField
                control={control}
                name="name"
                label={t('ingr.name')}
                helper={t('ingr.name.help')}
                maxLength={LIMITS.lineName}
                onBlur={() => {
                  nameTouched.current = true;
                }}
                testID="ingredient-name"
              />
              <FormAmountField
                control={control}
                name="amount"
                unitName="unit"
                label={t('ingr.amount')}
                units={LINE_UNITS}
                secondary={secondary}
                testID="ingredient-amount"
              />
              {showDensity ? (
                <View style={{ gap: space.sm }}>
                  <Text variant="footnote" color="textSecondary">
                    {t('ingr.densityNeeded', { item: item?.name ?? '' })}
                  </Text>
                  <FormTextField
                    control={control}
                    name="gramsPerCup"
                    label={t('price.field.gramsPerCup')}
                    variant="number"
                    suffix="g"
                    helper={t('ingr.savedToItem', { item: item?.name ?? '' })}
                    testID="ingredient-density"
                  />
                </View>
              ) : null}
              {showEach ? (
                <FormTextField
                  control={control}
                  name="gramsPerEach"
                  label={t('ingr.each', { item: item?.name ?? '' })}
                  variant="number"
                  suffix="g"
                  helper={t('ingr.savedToItem', { item: item?.name ?? '' })}
                  testID="ingredient-each"
                />
              ) : null}

              <View style={{ gap: space.sm }}>
                <Text variant="subhead">{t('ingr.role')}</Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('ingr.role')}
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
                >
                  {ROLES.map((role) => (
                    <Chip
                      single
                      key={role}
                      label={t(`ingr.role.${role}` as MessageKey)}
                      selected={values.role === role}
                      onPress={() => setRole(role)}
                      testID={`role-${role}`}
                    />
                  ))}
                </View>
                <Text variant="footnote" color="textSecondary">
                  {t('ingr.role.help')}
                </Text>
              </View>

              {levain ? (
                <View style={{ gap: space.sm }}>
                  <FormTextField
                    control={control}
                    name="levainHydration"
                    label={t('ingr.levainHydration')}
                    variant="number"
                    suffix="%"
                    testID="levain-hydration"
                  />
                  {split && parsed ? (
                    <Text variant="footnote" color="textSecondary">
                      {splitText}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {item && costText ? (
                <View style={{ gap: space.xs }} testID="cost-preview">
                  {costText.kind === 'text' ? (
                    <Text variant="footnote" color="textSecondary">
                      {costText.text}
                    </Text>
                  ) : (
                    <>
                      <Text variant="footnote" color="textSecondary">
                        {t('ingr.unpriced', { item: item.name })}
                      </Text>
                      <Button
                        variant="text"
                        label={t('ingr.addPrice')}
                        onPress={() => setPriceOpen(true)}
                      />
                    </>
                  )}
                </View>
              ) : null}
            </View>
            {editing ? (
              <View style={{ alignItems: 'center' }}>
                <Button
                  variant="destructive"
                  destructiveStyle="text"
                  label={t('ingr.delete')}
                  onPress={remove}
                  testID="delete-ingredient"
                />
              </View>
            ) : null}
          </ContentColumn>
        </ScrollView>
        <IngredientPickerSheet
          openerRef={itemRowRef}
          visible={pickerMode !== null}
          mode={pickerMode ?? 'replace'}
          usedItemIds={new Set(itemId ? [itemId] : [])}
          onClose={() => setPickerMode(null)}
          onSelectItem={(picked) => chooseItem(picked.id)}
          onAddToPantry={(query) => {
            const mode = pickerMode ?? 'replace';
            setPickerMode(null);
            usePickedItem.getState().expect(mode);
            router.push(
              routes.pantryEditor('new', `?returnTo=ingredient&name=${encodeURIComponent(query)}`),
            );
          }}
        />
        <PriceUpdateSheet item={priceOpen ? item : null} onClose={() => setPriceOpen(false)} />
      </View>
    </FormSubmittedContext.Provider>
  );
}
