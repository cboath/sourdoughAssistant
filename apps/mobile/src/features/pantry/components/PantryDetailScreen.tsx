import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import type { PriceHistoryEntry } from '../../../db/types';
import { t, tp, type MessageKey } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { displayLocalDate } from '../../../lib/localDate';
import { showSnackbar } from '../../../state/snackbar';
import {
  ActionSheet,
  Banner,
  Button,
  Card,
  ContentColumn,
  EmptyState,
  HeaderTextButton,
  Icon,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
  StatusTag,
  Text,
} from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { formatGrams, speakable } from '../../recipes/format';
import {
  categoryLabel,
  convertedSizeText,
  formatMoneyDigits,
  itemStatus,
  perGramText,
  priceChange,
  priceChangeText,
  readableUnitCost,
  sizeText,
} from '../format';
import { usePantryItem, usePantryService, usePriceHistory, useUsedIn } from '../hooks/usePantry';
import { PriceUpdateSheet } from './PriceUpdateSheet';

const HISTORY_PREVIEW = 5;

export function PantryDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { space, size, color } = useTheme();
  const display = useDisplayContext();
  const service = usePantryService();
  const item = usePantryItem(id);
  const history = usePriceHistory(id);
  const usedIn = useUsedIn(id);
  const [priceOpen, setPriceOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [entryMenu, setEntryMenu] = useState<{ entry: PriceHistoryEntry; index: number } | null>(
    null,
  );
  const updateRef = useRef<ComponentRef<typeof View>>(null);

  const entries = useMemo(() => history.data ?? [], [history.data]);

  if (item.isPending || history.isPending) {
    return (
      <ContentColumn>
        <Skeleton variant="detail" rows={3} />
      </ContentColumn>
    );
  }
  if (item.isError || history.isError) {
    return (
      <EmptyState
        variant="error"
        title={t('pantry.detail.loadError')}
        action={{
          label: t('common.tryAgain'),
          onPress: () => void Promise.all([item.refetch(), history.refetch()]),
        }}
      />
    );
  }
  if (!item.data) {
    return (
      <EmptyState
        variant="error"
        title={t('pantry.detail.gone')}
        action={{
          label: t('pantry.detail.backToPantry'),
          onPress: () => router.replace(routes.pantry),
        }}
      />
    );
  }

  const it = item.data;
  const status = itemStatus(it);
  const factors = { gramsPerCup: it.gramsPerCup, gramsPerEach: it.gramsPerEach };
  const readable = readableUnitCost(it, display);
  const perG = perGramText(it, display);
  const pkgText =
    it.packagePriceCents !== null && it.packageSize !== null && it.packageUnit !== null
      ? sizeText(it.packageSize, it.packageUnit, display.locale)
      : null;
  const converted =
    it.packageSize !== null && it.packageUnit !== null
      ? convertedSizeText(it.packageSize, it.packageUnit, display)
      : null;
  const priceText =
    it.packagePriceCents !== null ? formatMoneyDigits(it.packagePriceCents, display) : null;
  const pricedLine = it.pricedAt
    ? it.store
      ? t('pantry.detail.pricedAt', {
          date: displayLocalDate(it.pricedAt, display.locale),
          store: it.store,
        })
      : t('pantry.detail.priced', { date: displayLocalDate(it.pricedAt, display.locale) })
    : null;
  const updateLabel =
    it.packagePriceCents === null ? t('pantry.detail.addPrice') : t('pantry.detail.updatePrice');

  const edit = (focus?: 'gramsPerCup' | 'gramsPerEach') =>
    router.push(routes.pantryEditor(it.id, focus ? `?focus=${focus}` : ''));

  const deleteEntry = async (entry: PriceHistoryEntry, index: number) => {
    try {
      await service.deletePrice(entry.id);
      const next = index === 0 ? entries[1] : undefined;
      showSnackbar({
        message: next
          ? t('price.entryDeletedNewCurrent', {
              price: formatMoneyDigits(next.packagePriceCents, display),
            })
          : t('price.entryDeleted'),
        actionLabel: t('common.undo'),
        onAction: () => {
          haptic('impactLight');
          service.restorePrice(entry.id).catch((error: unknown) => {
            logger.error('pantry.restore_price_failed', error);
          });
        },
      });
    } catch (error) {
      logger.error('pantry.delete_price_failed', error);
      showSnackbar({
        message: t('common.saveFailed'),
        actionLabel: t('common.retry'),
        onAction: () => void deleteEntry(entry, index),
      });
    }
  };

  const shown = expanded ? entries : entries.slice(0, HISTORY_PREVIEW);
  const cardLabel =
    status === 'unpriced'
      ? t('pantry.detail.noPrice')
      : status === 'free'
        ? t('pantry.detail.free')
        : [
            t('pantry.detail.cardLabel', {
              package: `${priceText ?? ''} ${t('pantry.detail.for', { size: pkgText ?? '' })}`,
            }),
            perG,
            readable,
            pricedLine,
          ]
            .filter(Boolean)
            .join('. ');
  const spokenCard = speakable(cardLabel);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Stack.Screen
        options={{
          title: it.name,
          headerRight: () => (
            <HeaderTextButton label={t('pantry.detail.edit')} onPress={() => edit()} />
          ),
        }}
      />
      <ContentColumn padded={false}>
        <View style={{ padding: space.lg, gap: space.xs }}>
          <Text variant="title1" heading>
            {it.name}
          </Text>
          <Text variant="subhead" color="textSecondary">
            {categoryLabel(it.category)}
          </Text>
        </View>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Card>
            <View accessible accessibilityLabel={spokenCard} style={{ gap: space.sm }}>
              {status === 'unpriced' ? (
                <>
                  <Text variant="title2">{t('pantry.detail.noPrice')}</Text>
                  <Text>{t('pantry.detail.unpricedBody')}</Text>
                  <StatusTag variant="unpriced" />
                </>
              ) : (
                <>
                  {status === 'free' ? (
                    <>
                      <Text variant="title1">{t('pantry.detail.free')}</Text>
                      <Text>{t('pantry.detail.freeBody')}</Text>
                    </>
                  ) : (
                    <>
                      <Text variant="title1" numeric>
                        {priceText}
                      </Text>
                      <Text>
                        {t('pantry.detail.for', {
                          size: converted ? `${pkgText} (${converted})` : (pkgText ?? ''),
                        })}
                      </Text>
                      {perG || readable ? (
                        <View
                          style={{
                            borderTopWidth: size.borderWidth,
                            borderTopColor: color.border,
                            gap: space.xs,
                            paddingTop: space.sm,
                          }}
                        >
                          {perG ? (
                            <Text variant="callout" numeric>
                              {perG}
                            </Text>
                          ) : null}
                          {readable ? (
                            <Text variant="callout" numeric>
                              {readable}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  )}
                  {pricedLine ? (
                    <Text variant="footnote" color="textSecondary">
                      {pricedLine}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            {status === 'needsDensity' || status === 'needsEach' ? (
              <View style={{ marginTop: space.md }}>
                <Banner
                  variant="warning"
                  message={t(
                    status === 'needsDensity'
                      ? 'pantry.detail.needsDensity'
                      : 'pantry.detail.needsEach',
                  )}
                  actions={[
                    {
                      label: t('pantry.detail.add'),
                      onPress: () =>
                        edit(status === 'needsDensity' ? 'gramsPerCup' : 'gramsPerEach'),
                    },
                  ]}
                />
              </View>
            ) : null}
          </Card>
          <Button
            label={updateLabel}
            fullWidth
            ref={updateRef}
            onPress={() => setPriceOpen(true)}
            testID="update-price"
          />
        </View>

        <SectionHeader title={t('pantry.detail.conversions')} />
        <ListRow
          variant="value"
          title={t('pantry.detail.gramsPerCup')}
          value={
            it.gramsPerCup === null
              ? t('pantry.detail.notSet')
              : `${formatGrams(it.gramsPerCup, display.locale)}`
          }
          onPress={() => edit('gramsPerCup')}
        />
        {it.gramsPerEach !== null || it.packageUnit === 'each' ? (
          <ListRow
            variant="value"
            title={t('pantry.detail.weightOfOne')}
            value={
              it.gramsPerEach === null
                ? t('pantry.detail.notSet')
                : formatGrams(it.gramsPerEach, display.locale)
            }
            onPress={() => edit('gramsPerEach')}
          />
        ) : null}

        <SectionHeader
          title={t('pantry.detail.history')}
          trailingText={tp('pantry.detail.historyCount', entries.length)}
        />
        {entries.length === 0 ? (
          <Text color="textSecondary" style={{ paddingHorizontal: space.lg }}>
            {t('pantry.detail.noHistory')}
          </Text>
        ) : (
          shown.map((entry, index) => {
            const older = entries[index + 1];
            const change = older ? priceChange(entry, older, factors) : null;
            const changeText = change ? priceChangeText(change, display.locale) : null;
            const date = displayLocalDate(entry.pricedAt, display.locale);
            const pkg = `${formatMoneyDigits(entry.packagePriceCents, display)} ${t('pantry.detail.for', { size: sizeText(entry.packageSize, entry.packageUnit, display.locale) })}`;
            const arrow =
              change?.kind === 'up' ? 'arrowUp' : change?.kind === 'down' ? 'arrowDown' : null;
            return (
              <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <ListRow
                    variant="value"
                    title={pkg}
                    subtitle={entry.store ? `${date} · ${entry.store}` : date}
                    accessibilityLabel={speakable(
                      [pkg, date, changeText, index === 0 ? t('pantry.detail.current') : null]
                        .filter(Boolean)
                        .join(', '),
                    )}
                    accessibilityActions={
                      entries.length > 1
                        ? [{ name: 'delete', label: t('pantry.detail.deleteEntry') }]
                        : undefined
                    }
                    onAccessibilityAction={() => void deleteEntry(entry, index)}
                    trailing={
                      <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                        {changeText ? (
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}
                          >
                            {arrow ? (
                              <Icon name={arrow} size={size.iconSm} color="textSecondary" />
                            ) : null}
                            <Text variant="subhead" color="textSecondary">
                              {changeText}
                            </Text>
                          </View>
                        ) : null}
                        {index === 0 ? (
                          <StatusTag variant="done" text={t('pantry.detail.current')} />
                        ) : null}
                      </View>
                    }
                  />
                </View>
                {entries.length > 1 ? (
                  <IconButton
                    icon="more"
                    accessibilityLabel={t('pantry.detail.entryMenu', { date })}
                    onPress={() => setEntryMenu({ entry, index })}
                    testID={`delete-price-${entry.id}`}
                  />
                ) : null}
              </View>
            );
          })
        )}
        {entries.length > HISTORY_PREVIEW ? (
          <Button
            variant="text"
            expanded={expanded}
            label={
              expanded
                ? t('pantry.detail.showFewer')
                : t('pantry.detail.showAll', { count: entries.length })
            }
            onPress={() => setExpanded((v) => !v)}
          />
        ) : null}

        <SectionHeader title={t('pantry.detail.usedIn')} />
        {!usedIn.isSuccess ? null : usedIn.data.length > 0 ? (
          usedIn.data.map((entry) => (
            <ListRow
              key={entry.recipeId}
              title={entry.recipeName}
              subtitle={entry.lines
                .map((line) =>
                  line.role === 'levain'
                    ? `${formatGrams(line.amountG, display.locale)} · ${t('pantry.detail.levainUse')}`
                    : `${formatGrams(line.amountG, display.locale)} · ${t(`ingr.role.${line.role}` as MessageKey)}`,
                )
                .join(', ')}
              onPress={() => router.push(routes.recipe(entry.recipeId))}
            />
          ))
        ) : (
          <Text color="textSecondary" style={{ paddingHorizontal: space.lg }}>
            {t('pantry.detail.notUsed')}
          </Text>
        )}
      </ContentColumn>
      <PriceUpdateSheet
        item={priceOpen ? it : null}
        openerRef={updateRef}
        onClose={() => setPriceOpen(false)}
      />
      <ActionSheet
        title={
          entryMenu
            ? t('pantry.detail.entryMenu', {
                date: displayLocalDate(entryMenu.entry.pricedAt, display.locale),
              })
            : null
        }
        onClose={() => setEntryMenu(null)}
        actions={
          entryMenu
            ? [
                {
                  label: t('pantry.detail.deleteEntry'),
                  destructive: true,
                  onPress: () => void deleteEntry(entryMenu.entry, entryMenu.index),
                },
              ]
            : []
        }
      />
    </ScrollView>
  );
}
