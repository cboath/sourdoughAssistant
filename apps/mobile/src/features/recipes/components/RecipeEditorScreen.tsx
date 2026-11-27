import { randomUUID } from 'expo-crypto';
import { Stack, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, View } from 'react-native';
import { doughTotals, roundHalfUp } from '@sourdough/core';
import { RepositoryError } from '../../../db/errors';
import type { PantryItem } from '../../../db/types';
import { t, tp, type MessageKey } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { routes } from '../../../lib/nav';
import { LIMITS } from '../../../lib/sanitize';
import { showSnackbar } from '../../../state/snackbar';
import {
  ActionSheet,
  Button,
  Card,
  Chip,
  ContentColumn,
  EditorGone,
  Icon,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
  Stepper,
  StatusTag,
  Text,
  TextField,
  type SheetAction,
  type TextFieldRef,
} from '../../../ui/components';
import { confirm } from '../../../ui/confirm';
import { editorHeaderOptions } from '../../../ui/editorHeader';
import { haptic } from '../../../ui/haptics';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useTheme } from '../../../ui/theme';
import { useDiscardGuard } from '../../../ui/useDiscardGuard';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { itemStatus } from '../../pantry/format';
import { usePantryList } from '../../pantry/hooks/usePantry';
import { usePickedItem } from '../../pantry/pickedItem';
import {
  addTag,
  blankDraft,
  duplicateDraft,
  draftFromAggregate,
  draftToLines,
  validateDraft,
  withNewIds,
  type DraftIngredient,
  type DraftIssue,
  type IssueTarget,
  type DraftStep,
  type RecipeDraft,
} from '../draft';
import {
  amountDisplay,
  formatDuration,
  formatGrams,
  formatPercent,
  formatRatioPercent,
  speakable,
} from '../format';
import { useRecipe } from '../hooks/useRecipes';
import { useRecipeAggregates, useRecipeService } from '../hooks/useRecipeData';
import { spanMinutes } from '../metrics';
import { stepLabel, stepSubtitle } from '../stepText';
import { selectIsDirty, useRecipeDraft } from '../store';
import { IngredientPickerSheet } from './IngredientPickerSheet';

export interface RecipeEditorProps {
  /** `new` or a recipe id. */
  id: string;
  duplicateOf?: string;
}

/** RECIPE-EDIT (screens-recipes.md section 6). Loads the draft once, then edits it in the store. */
export function RecipeEditorScreen({ id, duplicateOf }: RecipeEditorProps) {
  const sourceId = id !== 'new' ? id : (duplicateOf ?? null);
  const source = useRecipe(sourceId ?? '');
  const sourceKey = id !== 'new' ? `edit:${id}` : duplicateOf ? `copy:${duplicateOf}` : 'new';
  const currentKey = useRecipeDraft((s) => s.sourceKey);
  const init = useRecipeDraft((s) => s.init);

  const waiting = sourceId !== null && source.isPending;
  const missing = sourceId !== null && source.data === null;

  useEffect(() => {
    if (currentKey === sourceKey || waiting || missing) return;
    if (id !== 'new' && source.data) {
      init(sourceKey, id, draftFromAggregate(source.data));
    } else if (duplicateOf && source.data) {
      init(sourceKey, null, duplicateDraft(source.data, randomUUID));
    } else if (!sourceId) {
      init(sourceKey, null, blankDraft(randomUUID));
    }
  }, [currentKey, sourceKey, waiting, missing, id, duplicateOf, sourceId, source.data, init]);

  if (missing) {
    return (
      <EditorGone
        title={t('detail.gone')}
        headerTitle={t('edit.titleEdit')}
        actionLabel={t('detail.backToRecipes')}
      />
    );
  }
  if (waiting || currentKey !== sourceKey) {
    return (
      <ContentColumn>
        <Skeleton rows={6} />
      </ContentColumn>
    );
  }
  return <EditorBody recipeId={id === 'new' ? null : id} />;
}

type MenuState = { title: string; actions: SheetAction[] } | null;

function EditorBody({ recipeId }: { recipeId: string | null }) {
  const router = useRouter();
  const { space, size, color } = useTheme();
  const display = useDisplayContext();
  const service = useRecipeService();
  const draft = useRecipeDraft((s) => s.draft) as RecipeDraft;
  const dirty = useRecipeDraft(selectIsDirty);
  const store = useRecipeDraft.getState;
  const pantry = usePantryList({ includeArchived: true });
  const aggregates = useRecipeAggregates();
  const [showErrors, setShowErrors] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagText, setTagText] = useState('');
  const [tagError, setTagError] = useState<string | undefined>();
  const [dwText, setDwText] = useState(
    draft.recipe.doughWeightG === null ? '' : String(draft.recipe.doughWeightG),
  );
  const nameRef = useRef<TextFieldRef>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const addIngredientRef = useRef<ComponentRef<typeof View>>(null);
  const targets = useRef<Record<string, ComponentRef<typeof View> | null>>({});
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const editing = recipeId !== null;
  // A fresh copy is a new unsaved record, so saving it unchanged is valid (screens-recipes.md 0.3).
  const freshCopy = useRecipeDraft((s) => s.sourceKey?.startsWith('copy:') ?? false);

  const guard = useDiscardGuard(
    dirty,
    {
      title: t('common.discard.title'),
      confirmLabel: t('common.discard.confirm'),
      cancelLabel: t('common.discard.keep'),
      destructive: true,
    },
    true,
  );

  const pantryById = useMemo(
    () => new Map<string, PantryItem>((pantry.data ?? []).map((p) => [p.id, p])),
    [pantry.data],
  );
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const lines = useMemo(() => draftToLines(draft.ingredients), [draft.ingredients]);
  const totals = useMemo(() => doughTotals(lines), [lines]);
  const span = useMemo(
    () => (validation.stepsValid ? spanMinutes(draft.steps, draft.recipe.yieldLoaves) : null),
    [validation.stepsValid, draft.steps, draft.recipe.yieldLoaves],
  );
  const usedItemIds = useMemo(
    () => new Set(draft.ingredients.flatMap((i) => (i.pantryItemId ? [i.pantryItemId] : []))),
    [draft.ingredients],
  );
  const allTags = useMemo(
    () => [...new Set((aggregates.data ?? []).flatMap((a) => a.recipe.tags))],
    [aggregates.data],
  );

  // A pantry item created from the picker comes back through the hand-off store.
  const pickedFromPantry = usePickedItem((s) => (s.request === 'add' ? s.itemId : null));
  useEffect(() => {
    if (!pickedFromPantry) return;
    const itemId = usePickedItem.getState().consume('add');
    if (itemId) router.push(routes.ingredientEditor(`?pantryItemId=${itemId}`));
  }, [pickedFromPantry, router]);

  const close = useCallback(() => router.back(), [router]);

  const perLoaf = roundHalfUp(totals.totalDoughG / Math.max(1, draft.recipe.yieldLoaves));
  const setName = (name: string) => store().setRecipe({ name });

  /** Moves screen-reader focus (and the view) to a section or row that has an error. */
  const goTo = (target: IssueTarget) => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (target === 'name') {
      nameRef.current?.focus();
      return;
    }
    const key = typeof target === 'string' ? target : `step:${target.stepId}`;
    const node = targets.current[key];
    const handle = node ? findNodeHandle(node) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };

  const failSave = (message: string) => {
    logger.error('recipes.save_failed');
    showSnackbar({
      message,
      actionLabel: t('common.retry'),
      onAction: () => void save(),
    });
  };

  const save = async (): Promise<void> => {
    // A second tap while the write runs must not start another one.
    if (savingRef.current) return;
    const result = validateDraft(store().draft as RecipeDraft);
    if (result.issues.length > 0) {
      setShowErrors(true);
      haptic('warning');
      AccessibilityInfo.announceForAccessibility(tp('val.announce', result.issues.length));
      const first = result.issues[0];
      if (first) goTo(first.target);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const current = store().draft as RecipeDraft;
      if (recipeId) {
        await service.update(recipeId, current);
        guard.allowLeave();
        close();
      } else {
        const created = await service.create(current);
        guard.allowLeave();
        close();
        router.push(routes.recipe(created.recipe.id));
      }
      showSnackbar({ message: t('edit.saved') });
    } catch (error) {
      try {
        if (error instanceof RepositoryError && error.code === 'notFound') {
          const saveNew = await confirm({
            title: t('edit.deletedElsewhere.title'),
            message: t('edit.deletedElsewhere.body'),
            confirmLabel: t('edit.deletedElsewhere.saveNew'),
            cancelLabel: t('edit.deletedElsewhere.discard'),
          });
          guard.allowLeave();
          if (saveNew) {
            // The old rows are tombstoned, not gone: the copy needs its own ids.
            const created = await service.create(
              withNewIds(store().draft as RecipeDraft, randomUUID),
            );
            close();
            router.push(routes.recipe(created.recipe.id));
            showSnackbar({ message: t('edit.saved') });
          } else close();
        } else failSave(t('common.saveFailed'));
      } catch {
        failSave(t('common.saveFailed'));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteRecipe = async () => {
    if (!recipeId) return;
    const name = draft.recipe.name;
    const ok = await confirm({
      title: t('recipe.delete.title', { name }),
      message: t('recipe.delete.body'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.keep'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await service.remove(recipeId);
      guard.allowLeave();
      router.dismissAll();
      router.navigate(routes.recipes);
      showSnackbar({
        message: t('recipe.deleted', { name }),
        actionLabel: t('common.undo'),
        onAction: () => {
          haptic('impactLight');
          service.restore(recipeId).catch((error: unknown) => {
            logger.error('recipes.restore_failed', error);
            showSnackbar({
              message: t('common.saveFailed'),
              actionLabel: t('common.retry'),
              onAction: () => void service.restore(recipeId),
            });
          });
        },
      });
    } catch (error) {
      logger.error('recipes.delete_failed', error);
      showSnackbar({
        message: t('common.saveFailed'),
        actionLabel: t('common.retry'),
        onAction: () => void deleteRecipe(),
      });
    }
  };

  // Ingredient and step list actions -------------------------------------------------------

  const announceMove = (pos: number, count: number) =>
    AccessibilityInfo.announceForAccessibility(t('edit.moved', { pos, count }));

  const moveIngredient = (ing: DraftIngredient, delta: -1 | 1) => {
    store().moveIngredient(ing.id, delta);
    const list = (store().draft as RecipeDraft).ingredients;
    announceMove(list.findIndex((i) => i.id === ing.id) + 1, list.length);
  };
  const deleteIngredient = (ing: DraftIngredient) => {
    const removed = store().removeIngredient(ing.id);
    if (!removed) return;
    showSnackbar({
      message: t('edit.lineDeleted', { name: ing.name }),
      actionLabel: t('common.undo'),
      onAction: () => {
        haptic('impactLight');
        store().insertIngredient(removed.item, removed.index);
      },
    });
  };
  const moveStep = (step: DraftStep, delta: -1 | 1) => {
    store().moveStep(step.id, delta);
    const list = (store().draft as RecipeDraft).steps;
    announceMove(list.findIndex((s) => s.id === step.id) + 1, list.length);
  };
  const deleteStep = (step: DraftStep) => {
    const removed = store().removeStep(step.id);
    if (!removed) return;
    const first = removed.dependents[0];
    showSnackbar({
      message: first
        ? t('edit.stepDeletedAnchor', { name: step.name, other: first.name })
        : t('edit.stepDeleted', { name: step.name }),
      actionLabel: t('common.undo'),
      onAction: () => {
        haptic('impactLight');
        store().insertStep(removed.item, removed.index);
      },
    });
  };

  const rowActions = (
    count: number,
    index: number,
    move: (delta: -1 | 1) => void,
    remove: () => void,
  ): SheetAction[] => [
    { label: t('edit.moveUp'), onPress: () => move(-1), disabled: index === 0 },
    { label: t('edit.moveDown'), onPress: () => move(1), disabled: index === count - 1 },
    { label: t('edit.deleteLine'), onPress: remove, destructive: true },
  ];

  const a11yActions = [
    { name: 'moveUp', label: t('edit.moveUp') },
    { name: 'moveDown', label: t('edit.moveDown') },
    { name: 'delete', label: t('edit.deleteLine') },
  ];
  const runAction = (
    name: string,
    index: number,
    count: number,
    move: (delta: -1 | 1) => void,
    remove: () => void,
  ) => {
    if (name === 'moveUp' && index > 0) move(-1);
    else if (name === 'moveDown' && index < count - 1) move(1);
    else if (name === 'delete') remove();
  };

  // Tags -----------------------------------------------------------------------------------

  const submitTag = (text: string) => {
    const result = addTag(draft.recipe.tags, text);
    if (!result.ok) {
      setTagError(result.error);
      return;
    }
    setTagError(undefined);
    store().setRecipe({ tags: result.tags });
    setTagText('');
  };
  const onTagChange = (text: string) => {
    if (text.includes(',')) {
      const [head, ...rest] = text.split(',');
      submitTag(head ?? '');
      setTagText(rest.join(','));
      return;
    }
    setTagText(text);
    setTagError(undefined);
  };
  const suggestions = tagText.trim()
    ? allTags
        .filter(
          (tag) =>
            tag.toLocaleLowerCase().includes(tagText.trim().toLocaleLowerCase()) &&
            !draft.recipe.tags.some((x) => x.toLocaleLowerCase() === tag.toLocaleLowerCase()),
        )
        .slice(0, 5)
    : [];

  // Dough weight ---------------------------------------------------------------------------

  const onDoughWeight = (text: string) => {
    setDwText(text);
    if (text.trim() === '') store().setRecipe({ doughWeightG: null });
    else {
      const n = Number(text.replace(/[^\d]/g, ''));
      store().setRecipe({ doughWeightG: /^\d+$/.test(text.trim()) ? n : Number.NaN });
    }
  };
  const dw = draft.recipe.doughWeightG;
  const showUse = dw !== null && Number.isFinite(dw) && Math.abs(perLoaf - dw) >= 1 && perLoaf > 0;

  const issuesShown = showErrors ? validation.issues : [];
  const summaryLines = issuesShown.slice(0, 3);
  const hydrationLine =
    totals.totalFlourG > 0
      ? t('edit.summary.hydration', {
          pct: formatRatioPercent(totals.totalWaterG, totals.totalFlourG, display.locale),
        })
      : t('edit.summary.noFlour');
  const totalsLine = t('edit.summary.totals', {
    flour: formatGrams(totals.totalFlourG, display.locale),
    water: formatGrams(totals.totalWaterG, display.locale),
    dough: formatGrams(totals.totalDoughG, display.locale),
  });
  const perLoafLine =
    draft.recipe.yieldLoaves > 1
      ? t('edit.summary.perLoaf', { weight: formatGrams(perLoaf, display.locale) })
      : null;
  // The summary is announced when hydration changes, at most every 2 s (iOS has no live regions).
  useAnnounce(hydrationLine, 2000);

  const section = (title: string, trailing?: string): ReactNode => (
    <SectionHeader title={trailing ? `${title} · ${trailing}` : title} />
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={editorHeaderOptions({
          title: t(editing ? 'edit.titleEdit' : 'edit.titleNew'),
          // The discard guard asks before the screen is removed when the draft is dirty.
          onClose: close,
          onSave: () => void save(),
          saveDisabled: (!dirty && !freshCopy) || saving,
        })}
      />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxxl }}
      >
        <ContentColumn style={{ paddingTop: space.lg, gap: space.lg }}>
          {issuesShown.length > 0 ? (
            <ErrorSummary
              issues={issuesShown}
              lines={summaryLines}
              onPress={(issue) => goTo(issue.target)}
            />
          ) : null}
        </ContentColumn>

        {section(t('edit.basics'))}
        <ContentColumn style={{ gap: space.lg }}>
          <TextField
            ref={nameRef}
            label={t('edit.name')}
            value={draft.recipe.name}
            onChangeText={setName}
            maxLength={LIMITS.recipeName}
            error={showErrors ? validation.name : undefined}
            testID="recipe-name"
          />
          <View style={{ gap: space.xs }}>
            <Text variant="subhead" accessible={false} importantForAccessibility="no">
              {t('edit.loaves')}
            </Text>
            <Stepper
              label={t('edit.loaves')}
              value={draft.recipe.yieldLoaves}
              min={1}
              max={50}
              onChange={(yieldLoaves) => {
                haptic('selection');
                store().setRecipe({ yieldLoaves });
              }}
              formatValue={(v) => tp('recipes.row.loaves', v)}
              testID="loaves-stepper"
            />
          </View>
          <TextField
            label={t('edit.doughWeight')}
            variant="number"
            suffix="g"
            value={dwText}
            onChangeText={onDoughWeight}
            error={showErrors ? validation.doughWeight : undefined}
            helper={
              lines.length > 0
                ? t('edit.doughWeight.help', { perLoaf: formatGrams(perLoaf, display.locale) })
                : undefined
            }
            testID="dough-weight"
          />
          {showUse ? (
            <Button
              variant="text"
              label={t('edit.doughWeight.use', { perLoaf: formatGrams(perLoaf, display.locale) })}
              onPress={() => {
                setDwText(String(perLoaf));
                store().setRecipe({ doughWeightG: perLoaf });
              }}
            />
          ) : null}
        </ContentColumn>

        {section(t('edit.ingredients'))}
        {draft.ingredients.length === 0 ? (
          <ContentColumn>
            <Text color="textSecondary">{t('edit.ingredients.emptyHint')}</Text>
          </ContentColumn>
        ) : null}
        {draft.ingredients.map((ing, index, all) => {
          const item = ing.pantryItemId ? pantryById.get(ing.pantryItemId) : undefined;
          const status = item ? itemStatus(item) : 'unpriced';
          const amount = amountDisplay(ing.amountG, display, item ?? undefined);
          const roleLabel = t(`ingr.role.${ing.role}` as MessageKey);
          const sub = !item
            ? `${roleLabel} · ${t('edit.notLinked')}`
            : ing.role === 'levain'
              ? `${roleLabel} · ${formatPercent(ing.levainHydrationPct ?? 100, display.locale, 0)} ${t('ingr.levainHydration').toLocaleLowerCase()}`
              : roleLabel;
          const tag =
            status === 'needsDensity'
              ? t('pantry.row.needsDensity')
              : status === 'needsEach'
                ? t('pantry.row.needsEach')
                : status === 'unpriced'
                  ? t('status.unpriced')
                  : null;
          const archived = item?.deletedAt ? ` ${t('edit.archivedSuffix')}` : '';
          const move = (d: -1 | 1) => moveIngredient(ing, d);
          const remove = () => deleteIngredient(ing);
          return (
            <View key={ing.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <ListRow
                  title={`${ing.name}${archived}`}
                  subtitle={amount.secondary ? `${sub} · ${amount.secondary}` : sub}
                  value={amount.primary}
                  trailing={tag ? <StatusTag variant="unpriced" text={tag} /> : undefined}
                  trailingPlacement="below"
                  accessibilityLabel={speakable(
                    `${ing.name}${archived}, ${roleLabel.toLocaleLowerCase()}, ${amount.primary}${amount.secondary ? `, ${amount.secondary}` : ''}${tag ? `, ${tag.toLocaleLowerCase()}` : ''}.`,
                  )}
                  accessibilityActions={a11yActions}
                  onAccessibilityAction={(n) => runAction(n, index, all.length, move, remove)}
                  onPress={() => router.push(routes.ingredientEditor(`?lineId=${ing.id}`))}
                  testID={`ingredient-${ing.id}`}
                />
              </View>
              <IconButton
                icon="more"
                accessibilityLabel={t('edit.rowOptions', { name: ing.name })}
                onPress={() =>
                  setMenu({ title: ing.name, actions: rowActions(all.length, index, move, remove) })
                }
                testID={`ingredient-menu-${ing.id}`}
              />
            </View>
          );
        })}
        <View
          ref={(node) => {
            targets.current.ingredients = node;
          }}
          collapsable={false}
        >
          <ListRow
            ref={addIngredientRef}
            variant="value"
            accentTitle
            title={t('edit.addIngredient')}
            leading={<Icon name="plus" color="accent" />}
            onPress={() => setPickerOpen(true)}
            testID="add-ingredient"
          />
        </View>
        {showErrors && validation.ingredients ? (
          <ContentColumn>
            <Text variant="footnote" color="danger">
              {validation.ingredients}
            </Text>
          </ContentColumn>
        ) : null}
        <ContentColumn style={{ paddingTop: space.md }}>
          <Card style={{ backgroundColor: color.surfaceSunken, shadowOpacity: 0, elevation: 0 }}>
            <View
              accessible
              accessibilityLabel={[t('edit.summary.label'), hydrationLine, totalsLine, perLoafLine]
                .filter(Boolean)
                .join('. ')}
              testID="recipe-summary"
              style={{ gap: space.xs }}
            >
              <Text variant="callout" numeric>
                {hydrationLine}
              </Text>
              <Text variant="callout" numeric>
                {totalsLine}
              </Text>
              {perLoafLine ? (
                <Text variant="callout" numeric>
                  {perLoafLine}
                </Text>
              ) : null}
            </View>
          </Card>
        </ContentColumn>

        {section(
          t('edit.steps'),
          span !== null
            ? t('edit.steps.total', { duration: formatDuration(span, display.locale) })
            : undefined,
        )}
        {draft.steps.map((step, index, all) => {
          const error =
            showErrors || validation.stepErrors[step.id]
              ? validation.stepErrors[step.id]
              : undefined;
          const alongside = step.anchor.type === 'alongside';
          const move = (d: -1 | 1) => moveStep(step, d);
          const remove = () => deleteStep(step);
          const seqNumber =
            all.slice(0, index).filter((s) => s.anchor.type === 'sequential').length + 1;
          return (
            <View
              key={step.id}
              ref={(node) => {
                targets.current[`step:${step.id}`] = node;
              }}
              collapsable={false}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <View style={{ flex: 1, paddingStart: alongside ? space.xl : 0 }}>
                <ListRow
                  title={step.name}
                  subtitle={stepSubtitle(step, all, display.locale)}
                  error={error}
                  trailingPlacement="below"
                  leading={
                    alongside ? (
                      <Icon name="parallel" color="textSecondary" size={size.iconSm} />
                    ) : (
                      <Text variant="subhead" color="textSecondary" numeric>
                        {seqNumber}
                      </Text>
                    )
                  }
                  trailing={
                    step.tempSensitive || !step.notify ? (
                      <View style={{ gap: space.xs }}>
                        {step.tempSensitive ? (
                          <StatusTag variant="adjusted" text={t('edit.step.tempTag')} />
                        ) : null}
                        {!step.notify ? (
                          <StatusTag variant="remindersOff" text={t('edit.step.noReminder')} />
                        ) : null}
                      </View>
                    ) : undefined
                  }
                  accessibilityLabel={`${stepLabel(step, seqNumber - 1, all, display.locale)}${error ? ` ${error}` : ''}`}
                  accessibilityActions={a11yActions}
                  onAccessibilityAction={(n) => runAction(n, index, all.length, move, remove)}
                  onPress={() => router.push(routes.stepEditor(`?stepId=${step.id}`))}
                  testID={`step-${step.id}`}
                />
              </View>
              <IconButton
                icon="more"
                accessibilityLabel={t('edit.rowOptions', { name: step.name })}
                onPress={() =>
                  setMenu({
                    title: step.name,
                    actions: rowActions(all.length, index, move, remove),
                  })
                }
                testID={`step-menu-${step.id}`}
              />
            </View>
          );
        })}
        <ListRow
          variant="value"
          accentTitle
          title={t('edit.addStep')}
          leading={<Icon name="plus" color="accent" />}
          onPress={() => router.push(routes.stepEditor())}
          testID="add-step"
        />
        <ContentColumn style={{ gap: space.sm, paddingTop: space.sm }}>
          {showErrors && validation.steps ? (
            <View
              ref={(node) => {
                targets.current.steps = node;
              }}
              collapsable={false}
            >
              <Text variant="footnote" color="danger">
                {validation.steps}
              </Text>
            </View>
          ) : null}
          {!draft.steps.some((s) => s.kind === 'bake') ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Icon name="info" size={size.iconSm} color="textSecondary" />
              <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                {t('edit.noBakeStep')}
              </Text>
            </View>
          ) : null}
        </ContentColumn>

        {section(t('edit.tags'))}
        <ContentColumn style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {draft.recipe.tags.map((tag) => (
              <Chip
                key={tag}
                variant="input"
                label={tag}
                onRemove={() =>
                  store().setRecipe({ tags: draft.recipe.tags.filter((x) => x !== tag) })
                }
              />
            ))}
          </View>
          <TextField
            label={t('edit.tags.add')}
            value={tagText}
            onChangeText={onTagChange}
            onSubmitEditing={() => submitTag(tagText)}
            returnKeyType="done"
            keepKeyboardOnSubmit
            error={tagError}
            testID="tag-input"
          />
          {suggestions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {suggestions.map((tag) => (
                <Chip key={tag} variant="assist" label={tag} onPress={() => submitTag(tag)} />
              ))}
            </View>
          ) : null}
        </ContentColumn>

        <View style={{ marginTop: space.lg }}>
          <ListRow
            variant="toggle"
            title={t('edit.favorite')}
            checked={draft.recipe.favorite}
            onCheckedChange={(favorite) => store().setRecipe({ favorite })}
            testID="favorite-toggle"
          />
        </View>

        {section(t('edit.notes'))}
        <ContentColumn>
          <TextField
            label={t('edit.notes')}
            variant="multiline"
            value={draft.recipe.notes}
            onChangeText={(notes) => store().setRecipe({ notes })}
            maxLength={LIMITS.recipeNotes}
            testID="recipe-notes"
          />
        </ContentColumn>

        {editing ? (
          <ContentColumn
            style={{ marginTop: space.xxl, marginBottom: space.xxxl, alignItems: 'center' }}
          >
            <Button
              variant="destructive"
              destructiveStyle="text"
              label={t('edit.delete')}
              onPress={() => void deleteRecipe()}
              testID="delete-recipe"
            />
          </ContentColumn>
        ) : null}
      </ScrollView>

      <ActionSheet
        title={menu?.title ?? null}
        actions={menu?.actions ?? []}
        onClose={() => setMenu(null)}
      />
      <IngredientPickerSheet
        openerRef={addIngredientRef}
        visible={pickerOpen}
        mode="add"
        usedItemIds={usedItemIds}
        onClose={() => setPickerOpen(false)}
        onSelectItem={(item) => {
          setPickerOpen(false);
          router.push(routes.ingredientEditor(`?pantryItemId=${item.id}`));
        }}
        onSelectLevain={() => {
          setPickerOpen(false);
          router.push(routes.ingredientEditor('?role=levain'));
        }}
        onAddToPantry={(query) => {
          setPickerOpen(false);
          usePickedItem.getState().expect('add');
          router.push(
            routes.pantryEditor('new', `?returnTo=ingredient&name=${encodeURIComponent(query)}`),
          );
        }}
      />
    </View>
  );
}

/** The failed-save summary: each line is a link that takes the user to the problem (6.2.1). */
function ErrorSummary({
  issues,
  lines,
  onPress,
}: {
  issues: readonly DraftIssue[];
  lines: readonly DraftIssue[];
  onPress: (issue: DraftIssue) => void;
}) {
  const { color, space, radius, size } = useTheme();
  const more = issues.length - lines.length;
  return (
    <View
      testID="error-summary"
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.md,
        backgroundColor: color.dangerContainer,
      }}
    >
      <Icon name="error" color="textOnDangerContainer" />
      <View style={{ flex: 1, gap: space.xs }}>
        {lines.map((issue, i) => (
          <Pressable
            key={`${issue.message}-${i}`}
            accessibilityRole="link"
            accessibilityLabel={issue.message}
            onPress={() => onPress(issue)}
            style={{ minHeight: size.touchMin, justifyContent: 'center' }}
          >
            <Text variant="callout" color="textOnDangerContainer">
              {issue.message}
            </Text>
          </Pressable>
        ))}
        {more > 0 ? (
          <Text variant="callout" color="textOnDangerContainer">
            {t('edit.errors.more', { count: more })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
