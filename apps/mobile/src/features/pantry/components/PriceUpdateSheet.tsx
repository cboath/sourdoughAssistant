import { useMemo, useRef, useState, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { currencyMinorDigits, unitDimension } from '@sourdough/core';
import type { PantryItem, Unit } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { makeResolver } from '../../../lib/form';
import { todayLocalDate, displayLocalDate } from '../../../lib/localDate';
import { formatNumberInput } from '../../../lib/number';
import { showSnackbar } from '../../../state/snackbar';
import { logger } from '../../../lib/logger';
import {
  FormSubmittedContext,
  Banner,
  Button,
  FormAmountField,
  FormTextField,
  Sheet,
  Text,
} from '../../../ui/components';
import { DateTimeField } from '../../../ui/components/DateTimeField';
import { confirm } from '../../../ui/confirm';
import { haptic } from '../../../ui/haptics';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useTheme } from '../../../ui/theme';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { formatPercent } from '../../recipes/format';
import {
  currencyName,
  currencySymbol,
  entryCostPerGram,
  itemStatus,
  readableUnitCost,
} from '../format';
import { usePantryService } from '../hooks/usePantry';
import { SIZE_MAX_LENGTH, validatePrice, type PriceFields } from '../validation';

export interface PriceUpdateSheetProps {
  /** The item to price; the sheet is open while this is set. */
  item: PantryItem | null;
  onClose: () => void;
  /** The button that opened the sheet; focus returns to it on close. */
  openerRef?: RefObject<unknown>;
  testID?: string;
}

function defaultsFor(item: PantryItem, locale: string, currency: string): PriceFields {
  const digits = currencyMinorDigits(currency);
  return {
    price:
      item.packagePriceCents === null
        ? ''
        : formatNumberInput(item.packagePriceCents / 10 ** digits, locale, digits),
    size: item.packageSize === null ? '' : formatNumberInput(item.packageSize, locale),
    unit: item.packageUnit ?? 'g',
    gramsPerCup: '',
    gramsPerEach: '',
    store: item.store ?? '',
    date: todayLocalDate(),
  };
}

/** PRICE-UPDATE (screens-recipes.md section 3): records a price; every save appends history. */
export function PriceUpdateSheet({ item, onClose, openerRef, testID }: PriceUpdateSheetProps) {
  // Scrim tap and Android back go through the form's discard check.
  const requestClose = useRef<() => void>(onClose);
  return (
    <Sheet
      visible={item !== null}
      onClose={() => requestClose.current()}
      title={item && item.packagePriceCents !== null ? t('price.titleUpdate') : t('price.titleAdd')}
      testID={testID}
      openerRef={openerRef}
    >
      {item ? (
        <PriceForm key={item.id} item={item} onClose={onClose} requestClose={requestClose} />
      ) : null}
    </Sheet>
  );
}

function PriceForm({
  item,
  onClose,
  requestClose,
}: {
  item: PantryItem;
  onClose: () => void;
  requestClose: RefObject<() => void>;
}) {
  const { space } = useTheme();
  const display = useDisplayContext();
  const service = usePantryService();
  const today = todayLocalDate();
  const rules = useMemo(
    () => ({
      currency: display.currency,
      locale: display.locale,
      today,
      optional: false,
      hasDensity: item.gramsPerCup !== null,
      hasEachWeight: item.gramsPerEach !== null,
    }),
    [display.currency, display.locale, today, item.gramsPerCup, item.gramsPerEach],
  );
  const form = useForm<PriceFields>({
    mode: 'onTouched',
    defaultValues: defaultsFor(item, display.locale, display.currency),
    resolver: makeResolver((v) => validatePrice(v, rules).errors),
  });
  const { control, handleSubmit, watch, setValue, formState } = form;
  const values = watch();
  // A first Save attempt makes every field show its error (screens-recipes.md 0.3).
  const [attempted, setAttempted] = useState(false);
  const dimension = unitDimension(values.unit);
  const showDensity = dimension === 'volume' && item.gramsPerCup === null;
  const showEach = values.unit === 'each' && item.gramsPerEach === null;

  const parsed = validatePrice(values, rules);
  const preview = useMemo(() => {
    if (!parsed.price) return null;
    const next = {
      packagePriceCents: parsed.price.priceCents,
      packageSize: parsed.price.size,
      packageUnit: parsed.price.unit,
      gramsPerCup: item.gramsPerCup ?? parsed.gramsPerCup,
      gramsPerEach: item.gramsPerEach ?? parsed.gramsPerEach,
    };
    const unitCost = readableUnitCost(next, display);
    if (!unitCost) return null;
    if (itemStatus(item) !== 'priced' && itemStatus(item) !== 'free') return unitCost;
    const old = readableUnitCost(item, display);
    const a = entryCostPerGram(
      {
        packagePriceCents: next.packagePriceCents,
        packageSize: next.packageSize,
        packageUnit: next.packageUnit,
      },
      next,
    );
    const b =
      item.packagePriceCents === null || item.packageSize === null || item.packageUnit === null
        ? null
        : entryCostPerGram(
            {
              packagePriceCents: item.packagePriceCents,
              packageSize: item.packageSize,
              packageUnit: item.packageUnit,
            },
            { gramsPerCup: next.gramsPerCup, gramsPerEach: next.gramsPerEach },
          );
    if (!old || a === null || b === null || b === 0) return unitCost;
    const pct = ((a - b) / b) * 100;
    const change =
      Math.abs(pct) < 0.5
        ? t('pantry.detail.same')
        : t(pct > 0 ? 'pantry.detail.up' : 'pantry.detail.down', {
            pct: formatPercent(Math.round(Math.abs(pct)), display.locale, 0),
          });
    return t('price.preview', { unitCost, old, change });
  }, [parsed.price, parsed.gramsPerCup, parsed.gramsPerEach, item, display]);

  useAnnounce(preview, 1000);

  const older = item.pricedAt !== null && values.date < item.pricedAt;

  const close = async () => {
    if (formState.isDirty) {
      const discard = await confirm({
        title: t('price.discard.title'),
        confirmLabel: t('price.discard.confirm'),
        cancelLabel: t('price.discard.keep'),
        destructive: true,
      });
      if (!discard) return;
    }
    onClose();
  };

  requestClose.current = () => void close();

  const submitForm = handleSubmit(
    async () => {
      const result = validatePrice(form.getValues(), rules);
      if (!result.price) return;
      try {
        const entry = await service.savePrice(item.id, {
          packagePriceCents: result.price.priceCents,
          packageSize: result.price.size,
          packageUnit: result.price.unit,
          store: result.price.store,
          pricedAt: result.price.pricedAt,
          gramsPerCup: result.gramsPerCup,
          gramsPerEach: result.gramsPerEach,
        });
        onClose();
        showSnackbar({
          message: t('price.saved'),
          actionLabel: t('common.undo'),
          onAction: () => {
            haptic('impactLight');
            service.undoSavePrice(entry, item).catch((error: unknown) => {
              logger.error('pantry.undo_price_failed', error);
            });
          },
        });
      } catch (error) {
        logger.error('pantry.save_price_failed', error);
        showSnackbar({
          message: t('common.saveFailed'),
          actionLabel: t('common.retry'),
          onAction: () => void submit(),
        });
      }
    },
    () => {
      haptic('warning');
    },
  );

  const submit = () => {
    setAttempted(true);
    return submitForm();
  };

  return (
    <FormSubmittedContext.Provider value={attempted}>
      <View style={{ padding: space.lg, gap: space.lg }} testID="price-update-form">
        <FormTextField
          control={control}
          name="price"
          label={t('price.field.price')}
          accessibilityLabel={t('price.field.priceSpoken', {
            currency: currencyName(display.currency, display.locale),
          })}
          variant="money"
          prefix={currencySymbol(display.currency, display.locale)}
          autoFocus
          testID="price-input"
        />
        <FormAmountField
          control={control}
          name="size"
          unitName="unit"
          label={t('price.field.size')}
          maxLength={SIZE_MAX_LENGTH}
          testID="size-input"
        />
        {showDensity ? (
          <FormTextField
            control={control}
            name="gramsPerCup"
            label={t('price.field.gramsPerCup')}
            variant="number"
            suffix="g"
            helper={t('price.field.gramsPerCup.help')}
            testID="density-input"
          />
        ) : null}
        {showEach ? (
          <FormTextField
            control={control}
            name="gramsPerEach"
            label={t('price.field.each')}
            variant="number"
            suffix="g"
            testID="each-input"
          />
        ) : null}
        <FormTextField
          control={control}
          name="store"
          label={t('price.field.store')}
          maxLength={60}
        />
        <DateTimeField
          label={t('price.field.date')}
          value={values.date}
          maxDate={today}
          onChange={(date) => setValue('date', date, { shouldDirty: true, shouldValidate: true })}
          error={form.formState.errors.date?.message}
        />
        {older && item.pricedAt ? (
          <Banner
            variant="info"
            message={t('price.olderInfo', {
              date: displayLocalDate(item.pricedAt, display.locale),
            })}
          />
        ) : null}
        {preview ? (
          <Text variant="callout" testID="price-preview">
            {preview}
          </Text>
        ) : null}
        <Text variant="footnote" color="textSecondary">
          {t('price.snapshotNote')}
        </Text>
        <Button
          label={t('price.saveAndroid')}
          size="lg"
          fullWidth
          onPress={() => void submit()}
          loading={formState.isSubmitting}
          testID="price-save"
        />
        <Button label={t('price.cancel')} variant="text" onPress={() => void close()} />
      </View>
    </FormSubmittedContext.Provider>
  );
}

export type { Unit };
