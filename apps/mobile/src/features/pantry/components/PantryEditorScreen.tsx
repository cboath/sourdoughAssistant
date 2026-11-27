import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import { currencyMinorDigits, unitDimension } from '@sourdough/core';
import type { PantryCategory, PantryItem } from '../../../db/types';
import { t, tp, type MessageKey } from '../../../lib/i18n';
import { makeResolver } from '../../../lib/form';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { todayLocalDate } from '../../../lib/localDate';
import { formatNumberInput } from '../../../lib/number';
import { LIMITS } from '../../../lib/sanitize';
import { showSnackbar } from '../../../state/snackbar';
import {
  Banner,
  Button,
  ContentColumn,
  DateTimeField,
  EditorGone,
  FormAmountField,
  FormSubmittedContext,
  FormTextField,
  ListRow,
  SectionHeader,
  Sheet,
  Skeleton,
  Text,
} from '../../../ui/components';
import { editorHeaderOptions } from '../../../ui/editorHeader';
import { confirm } from '../../../ui/confirm';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { useDiscardGuard } from '../../../ui/useDiscardGuard';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { guessCategory, typicalDensity } from '../densities';
import { currencyName, currencySymbol, packageText } from '../format';
import { usePantryItem, usePantryList, usePantryService, useUsedIn } from '../hooks/usePantry';
import { usePickedItem } from '../pickedItem';
import { SIZE_MAX_LENGTH, validatePantryEditor, type PantryEditorFields } from '../validation';
import { PriceUpdateSheet } from './PriceUpdateSheet';
import { CATEGORY_ORDER } from './PantryListScreen';

export interface PantryEditorProps {
  /** `new` or an item id. */
  id: string;
  returnTo?: 'ingredient';
  /** Prefill from the ingredient picker (already cleaned by the route-param schema). */
  name?: string;
  focus?: 'gramsPerCup' | 'gramsPerEach';
}

const FIELD_ORDER: Array<keyof PantryEditorFields> = [
  'name',
  'price',
  'size',
  'gramsPerCup',
  'gramsPerEach',
  'date',
];

function defaultsFor(
  item: PantryItem | null,
  prefillName: string | undefined,
  locale: string,
  currency: string,
): PantryEditorFields {
  const digits = currencyMinorDigits(currency);
  const name = item?.name ?? prefillName ?? '';
  const category: PantryCategory = item?.category ?? (name ? guessCategory(name) : 'other');
  const base: PantryEditorFields = {
    name,
    category,
    price: '',
    size: '',
    unit: item?.packageUnit ?? 'g',
    gramsPerCup: item?.gramsPerCup != null ? formatNumberInput(item.gramsPerCup, locale) : '',
    gramsPerEach: item?.gramsPerEach != null ? formatNumberInput(item.gramsPerEach, locale) : '',
    store: item?.store ?? '',
    date: todayLocalDate(),
  };
  if (!item && category === 'water') {
    return {
      ...base,
      price: formatNumberInput(0, locale, digits),
      size: '1',
      unit: 'l',
      gramsPerCup: '236.59',
    };
  }
  return base;
}

/** PANTRY-EDIT (screens-recipes.md section 4). */
export function PantryEditorScreen(props: PantryEditorProps) {
  const isNew = props.id === 'new';
  const itemQuery = usePantryItem(isNew ? '' : props.id);
  if (!isNew && itemQuery.isPending) {
    return (
      <ContentColumn>
        <Skeleton rows={4} />
      </ContentColumn>
    );
  }
  if (!isNew && !itemQuery.data) {
    return (
      <EditorGone
        title={t('pantry.detail.gone')}
        headerTitle={t('pantryEdit.titleEdit')}
        actionLabel={t('pantry.detail.backToPantry')}
      />
    );
  }
  return <PantryEditorForm {...props} item={itemQuery.data ?? null} />;
}

function PantryEditorForm({
  item,
  returnTo,
  name: prefillName,
  focus,
}: PantryEditorProps & { item: PantryItem | null }) {
  const router = useRouter();
  const { space } = useTheme();
  const display = useDisplayContext();
  const service = usePantryService();
  const all = usePantryList();
  const usedIn = useUsedIn(item?.id ?? '');
  const editing = item !== null;
  const today = todayLocalDate();

  const rules = useMemo(
    () => ({
      currency: display.currency,
      locale: display.locale,
      today,
      optional: true,
      editing,
      hasDensity: false,
      hasEachWeight: false,
    }),
    [display.currency, display.locale, today, editing],
  );
  const form = useForm<PantryEditorFields>({
    mode: 'onTouched',
    defaultValues: defaultsFor(item, prefillName, display.locale, display.currency),
    resolver: makeResolver((v) => validatePantryEditor(v, rules).errors),
  });
  const { control, handleSubmit, watch, setValue, setFocus, formState } = form;
  const values = watch();
  // A first Save attempt makes every field show its error (screens-recipes.md 0.3).
  const [attempted, setAttempted] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [dupName, setDupName] = useState<PantryItem | null>(null);
  const [densityOpen, setDensityOpen] = useState(focus === 'gramsPerCup');
  const [eachOpen, setEachOpen] = useState(focus === 'gramsPerEach');

  const guard = useDiscardGuard(
    formState.isDirty,
    {
      title: t('common.discard.title'),
      confirmLabel: t('common.discard.confirm'),
      cancelLabel: t('common.discard.keep'),
      destructive: true,
    },
    true,
  );

  // Conversions focus param: focus only, never a write.
  useEffect(() => {
    if (focus) setTimeout(() => setFocus(focus), 150);
  }, [focus, setFocus]);

  const volume = unitDimension(values.unit) === 'volume';
  const priced = values.price.trim() !== '' || values.size.trim() !== '';
  const showDensity = densityOpen || values.gramsPerCup !== '' || (!editing && priced && volume);
  const showEach =
    eachOpen || values.gramsPerEach !== '' || (!editing && priced && values.unit === 'each');
  const typical = typicalDensity(values.name);

  const checkDuplicate = () => {
    const needle = values.name.trim().toLocaleLowerCase();
    const hit = needle
      ? (all.data ?? []).find(
          (p) => p.id !== item?.id && p.name.trim().toLocaleLowerCase() === needle,
        )
      : undefined;
    setDupName(hit ?? null);
    if (!editing && !values.gramsPerCup && typical !== null) {
      setValue('gramsPerCup', formatNumberInput(typical, display.locale), { shouldDirty: true });
    }
  };

  const chooseCategory = (category: PantryCategory) => {
    setValue('category', category, { shouldDirty: true });
    if (!editing && category === 'water' && !priced) {
      setValue(
        'price',
        formatNumberInput(0, display.locale, currencyMinorDigits(display.currency)),
        {
          shouldDirty: true,
        },
      );
      setValue('size', '1', { shouldDirty: true });
      setValue('unit', 'l', { shouldDirty: true });
      setValue('gramsPerCup', '236.59', { shouldDirty: true });
    }
    setCategoryOpen(false);
  };

  const close = () => router.back();

  const saveForm = handleSubmit(
    async () => {
      const { result, errors } = validatePantryEditor(form.getValues(), rules);
      if (Object.keys(errors).length > 0) return;
      try {
        if (item) {
          await service.updateItem(item.id, {
            name: result.name,
            category: values.category as PantryCategory,
            gramsPerCup: result.gramsPerCup,
            gramsPerEach: result.gramsPerEach,
          });
          guard.allowLeave();
          close();
          return;
        }
        const created = await service.createItem({
          name: result.name,
          category: values.category as PantryCategory,
          gramsPerCup: result.gramsPerCup,
          gramsPerEach: result.gramsPerEach,
          ...(result.price
            ? {
                packagePriceCents: result.price.priceCents,
                packageSize: result.price.size,
                packageUnit: result.price.unit,
                store: result.price.store,
                pricedAt: result.price.pricedAt,
              }
            : {}),
        });
        guard.allowLeave();
        close();
        if (returnTo === 'ingredient') usePickedItem.getState().publish(created.id);
        else router.push(routes.pantryItem(created.id));
      } catch (error) {
        logger.error('pantry.save_failed', error);
        showSnackbar({
          message: t('common.saveFailed'),
          actionLabel: t('common.retry'),
          onAction: () => void save(),
        });
      }
    },
    (errors) => {
      const count = Object.keys(errors).length;
      setFailedCount(count);
      haptic('warning');
      AccessibilityInfo.announceForAccessibility(tp('val.announce', count));
      const first = FIELD_ORDER.find((key) => errors[key]);
      if (first) setFocus(first);
    },
  );

  const save = () => {
    setAttempted(true);
    return saveForm();
  };

  const removeItem = async () => {
    if (!item) return;
    const used = usedIn.data?.length ?? 0;
    const archive = used > 0;
    const ok = await confirm({
      title: t(archive ? 'pantryEdit.archive.title' : 'pantryEdit.delete.title', {
        name: item.name,
      }),
      message: archive ? tp('pantryEdit.archive.body', used) : t('pantryEdit.delete.body'),
      confirmLabel: t(archive ? 'common.archive' : 'common.delete'),
      cancelLabel: t('common.keep'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await service.archive(item.id);
      guard.allowLeave();
      close();
      showSnackbar({
        message: t(archive ? 'pantry.archived' : 'pantry.deleted', { name: item.name }),
        actionLabel: t('common.undo'),
        onAction: () => {
          haptic('impactLight');
          service.unarchive(item.id).catch((error: unknown) => {
            logger.error('pantry.unarchive_failed', error);
            showSnackbar({
              message: t('common.saveFailed'),
              actionLabel: t('common.retry'),
              onAction: () => void service.unarchive(item.id),
            });
          });
        },
      });
    } catch (error) {
      logger.error('pantry.archive_failed', error);
      showSnackbar({
        message: t('common.saveFailed'),
        actionLabel: t('common.retry'),
        onAction: () => void removeItem(),
      });
    }
  };

  const errorCount = Object.keys(formState.errors).length;
  const used = usedIn.data?.length ?? 0;
  const currentPackage = item ? packageText(item, display) : null;

  return (
    <FormSubmittedContext.Provider value={attempted}>
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={editorHeaderOptions({
            title: t(editing ? 'pantryEdit.titleEdit' : 'pantryEdit.titleNew'),
            onClose: close,
            onSave: () => void save(),
            saveDisabled: !formState.isDirty,
          })}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxxl }}
        >
          <ContentColumn style={{ paddingTop: space.lg, gap: space.lg }}>
            {failedCount > 0 && errorCount > 0 ? (
              <Banner variant="danger" message={tp('val.summary', errorCount)} />
            ) : null}
            <FormTextField
              control={control}
              name="name"
              label={t('pantryEdit.name')}
              maxLength={LIMITS.pantryName}
              onBlur={checkDuplicate}
              testID="pantry-name"
            />
            {dupName ? (
              <Banner
                variant="warning"
                message={t('pantryEdit.dup', { name: dupName.name })}
                actions={[
                  {
                    label: t('pantryEdit.dup.view'),
                    onPress: async () => {
                      if (formState.isDirty) {
                        const ok = await confirm({
                          title: t('common.discard.title'),
                          confirmLabel: t('common.discard.confirm'),
                          cancelLabel: t('common.discard.keep'),
                          destructive: true,
                        });
                        if (!ok) return;
                      }
                      guard.allowLeave();
                      router.replace(routes.pantryItem(dupName.id));
                    },
                  },
                ]}
              />
            ) : null}
            <View>
              <ListRow
                variant="value"
                title={t('pantryEdit.category')}
                value={t(`pantry.cat.${values.category}` as MessageKey)}
                onPress={() => setCategoryOpen(true)}
                accessibilityHint={t('pantryEdit.category.help')}
                testID="category-row"
              />
              <Text
                variant="footnote"
                color="textSecondary"
                style={{ paddingHorizontal: space.lg }}
              >
                {t('pantryEdit.category.help')}
              </Text>
            </View>
          </ContentColumn>

          <SectionHeader title={t('pantryEdit.price')} />
          <ContentColumn style={{ gap: space.lg }}>
            {editing ? (
              <>
                <ListRow
                  variant="value"
                  title={t('pantryEdit.currentPrice')}
                  value={currentPackage ?? t('status.unpriced')}
                />
                <Button
                  variant="tonal"
                  label={t(
                    item?.packagePriceCents === null
                      ? 'pantry.detail.addPrice'
                      : 'pantry.detail.updatePrice',
                  )}
                  onPress={() => setPriceOpen(true)}
                />
              </>
            ) : (
              <>
                <FormTextField
                  control={control}
                  name="price"
                  label={t('price.field.price')}
                  accessibilityLabel={t('price.field.priceSpoken', {
                    currency: currencyName(display.currency, display.locale),
                  })}
                  variant="money"
                  prefix={currencySymbol(display.currency, display.locale)}
                  testID="pantry-price"
                />
                <FormAmountField
                  control={control}
                  name="size"
                  unitName="unit"
                  label={t('price.field.size')}
                  maxLength={SIZE_MAX_LENGTH}
                  testID="pantry-size"
                />
                <FormTextField
                  control={control}
                  name="store"
                  label={t('price.field.store')}
                  maxLength={LIMITS.store}
                />
                <DateTimeField
                  label={t('price.field.date')}
                  value={values.date}
                  maxDate={today}
                  onChange={(date) =>
                    setValue('date', date, { shouldDirty: true, shouldValidate: true })
                  }
                  error={formState.errors.date?.message}
                />
                <Text variant="footnote" color="textSecondary">
                  {values.category === 'water'
                    ? t('pantryEdit.water.help')
                    : t('pantryEdit.price.help')}
                </Text>
              </>
            )}
          </ContentColumn>

          <SectionHeader title={t('pantryEdit.conversions')} />
          <ContentColumn style={{ gap: space.lg }}>
            {showDensity ? (
              <FormTextField
                control={control}
                name="gramsPerCup"
                label={t('price.field.gramsPerCup')}
                variant="number"
                suffix="g"
                helper={
                  typical !== null &&
                  values.gramsPerCup === formatNumberInput(typical, display.locale)
                    ? t('pantryEdit.densityTypical', {
                        name: values.name.trim(),
                        value: formatNumberInput(typical, display.locale),
                      })
                    : t('price.field.gramsPerCup.help')
                }
                testID="pantry-density"
              />
            ) : (
              <Button
                variant="text"
                label={t('pantryEdit.addDensity')}
                onPress={() => setDensityOpen(true)}
                accessibilityHint={undefined}
              />
            )}
            {showEach ? (
              <FormTextField
                control={control}
                name="gramsPerEach"
                label={t('price.field.each')}
                variant="number"
                suffix="g"
                helper={t('pantryEdit.each.help')}
                testID="pantry-each"
              />
            ) : (
              <Button
                variant="text"
                label={t('pantryEdit.addEach')}
                onPress={() => setEachOpen(true)}
              />
            )}
          </ContentColumn>

          {editing ? (
            <ContentColumn style={{ marginTop: space.xxl, alignItems: 'center' }}>
              <Button
                variant="destructive"
                destructiveStyle="text"
                label={t(used > 0 ? 'pantryEdit.archive' : 'pantryEdit.delete')}
                onPress={() => void removeItem()}
                testID="pantry-remove"
              />
            </ContentColumn>
          ) : null}
        </ScrollView>

        <Sheet
          visible={categoryOpen}
          onClose={() => setCategoryOpen(false)}
          title={t('pantryEdit.category')}
        >
          <View accessibilityRole="radiogroup">
            {CATEGORY_ORDER.map((category) => (
              <ListRow
                key={category}
                variant="selectable"
                selectionMode="single"
                title={t(`pantry.cat.${category}` as MessageKey)}
                checked={values.category === category}
                onPress={() => chooseCategory(category)}
                testID={`category-${category}`}
              />
            ))}
          </View>
        </Sheet>
        <PriceUpdateSheet item={priceOpen ? item : null} onClose={() => setPriceOpen(false)} />
      </View>
    </FormSubmittedContext.Provider>
  );
}
